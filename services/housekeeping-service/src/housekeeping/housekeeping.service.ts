import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DomainError,
  EventType,
  HousekeepingTaskStatus,
  Topic,
  buildEvent,
} from '@staysphere/contracts';
import { nanoid } from 'nanoid';
import type { HousekeepingEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  AssignTaskDto,
  CompleteTaskDto,
  CreateShiftDto,
  CreateTaskDto,
  ListTasksQuery,
  VerifyTaskDto,
} from './dto.js';
import {
  EXPECTED_MINUTES,
  assertTaskTransition,
  compareTasks,
  computePriority,
  selectAssignee,
  type TaskType,
} from './prioritisation.js';

export const HOUSEKEEPING_ENV = Symbol('HOUSEKEEPING_ENV');
export const CLOCK = Symbol('CLOCK');

export interface Clock {
  now(): Date;
}

/** Default checklist for a checkout clean. Inspection is always last. */
const CHECKOUT_CHECKLIST = [
  { label: 'Strip and remake beds', required: true },
  { label: 'Bathroom cleaned and sanitised', required: true },
  { label: 'Floors vacuumed and mopped', required: true },
  { label: 'Surfaces dusted', required: true },
  { label: 'Amenities restocked', required: true },
  { label: 'Minibar checked and recorded', required: true },
  { label: 'Windows and mirrors cleaned', required: false },
  { label: 'Final visual inspection', required: true },
] as const;

@Injectable()
export class HousekeepingService {
  private readonly logger = new Logger(HousekeepingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(HOUSEKEEPING_ENV) private readonly env: HousekeepingEnv,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async createTask(dto: CreateTaskDto) {
    const now = this.clock.now();
    const nextArrivalAt = dto.nextArrivalAt ? new Date(dto.nextArrivalAt) : null;

    const priority = computePriority({
      type: dto.type as TaskType,
      nextArrivalAt,
      now,
      isRework: false,
      vip: dto.vip,
    });

    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.housekeepingTask.create({
        data: {
          hotelId: dto.hotelId,
          roomId: dto.roomId,
          roomNumber: dto.roomNumber,
          floor: dto.floor,
          type: dto.type,
          priority,
          nextArrivalAt,
          dueAt: nextArrivalAt,
          notes: dto.notes ?? null,
          checklist: {
            create: CHECKOUT_CHECKLIST.map((item, index) => ({
              label: item.label,
              required: item.required,
              sortOrder: index,
            })),
          },
        },
        include: { checklist: { orderBy: { sortOrder: 'asc' } } },
      });

      const event = buildEvent({
        eventId: `evt_${nanoid(20)}`,
        type: EventType.HOUSEKEEPING_TASK_CREATED,
        version: 1,
        source: this.env.SERVICE_NAME,
        correlationId: `hk_${nanoid(16)}`,
        occurredAt: now,
        hotelId: dto.hotelId,
        payload: {
          taskId: created.id,
          hotelId: created.hotelId,
          roomId: created.roomId,
          roomNumber: created.roomNumber,
          taskType: created.type,
          priority: created.priority,
          dueAt: created.dueAt?.toISOString() ?? null,
        },
      });

      await tx.outboxEvent.create({
        data: {
          topic: Topic.HOUSEKEEPING,
          partitionKey: dto.hotelId,
          eventType: event.type,
          payload: event as unknown as object,
        },
      });

      return created;
    });

    this.logger.log(
      { taskId: task.id, roomNumber: dto.roomNumber, priority },
      'Cleaning task queued',
    );
    return task;
  }

  /** Assigns a task, choosing the least-loaded housekeeper when none is named. */
  async assign(taskId: string, dto: AssignTaskDto) {
    const task = await this.prisma.housekeepingTask.findUnique({ where: { id: taskId } });
    if (!task) throw DomainError.notFound('HousekeepingTask', taskId);

    assertTaskTransition(task.status as HousekeepingTaskStatus, HousekeepingTaskStatus.ASSIGNED);

    const now = this.clock.now();
    let staffId = dto.staffId;
    let staffName: string | undefined;

    if (!staffId) {
      const shifts = await this.prisma.housekeeperShift.findMany({
        where: { hotelId: task.hotelId, startsAt: { lte: now }, endsAt: { gte: now } },
      });

      const loads = await Promise.all(
        shifts.map(async (shift) => ({
          staffId: shift.staffId,
          staffName: shift.staffName,
          capacity: shift.capacity,
          assignedCount: await this.prisma.housekeepingTask.count({
            where: {
              assignedToId: shift.staffId,
              status: { in: [HousekeepingTaskStatus.ASSIGNED, HousekeepingTaskStatus.IN_PROGRESS] },
            },
          }),
        })),
      );

      const chosen = selectAssignee(loads);
      staffId = chosen.staffId;
      staffName = chosen.staffName;
    }

    return this.prisma.housekeepingTask.update({
      where: { id: taskId },
      data: {
        status: HousekeepingTaskStatus.ASSIGNED,
        assignedToId: staffId,
        assignedToName: staffName ?? null,
        assignedAt: now,
      },
    });
  }

  async start(taskId: string, staffId: string) {
    const task = await this.prisma.housekeepingTask.findUnique({ where: { id: taskId } });
    if (!task) throw DomainError.notFound('HousekeepingTask', taskId);
    if (task.assignedToId !== staffId) {
      throw DomainError.forbidden('This task is assigned to someone else.');
    }
    assertTaskTransition(task.status as HousekeepingTaskStatus, HousekeepingTaskStatus.IN_PROGRESS);

    return this.prisma.housekeepingTask.update({
      where: { id: taskId },
      data: { status: HousekeepingTaskStatus.IN_PROGRESS, startedAt: this.clock.now() },
    });
  }

  /**
   * Marks a clean finished.
   *
   * Every required checklist item must pass first — the checklist is what turns
   * "the room looks done" into "the room was actually done", and skipping it is
   * how a guest finds an unmade bed.
   */
  async complete(taskId: string, dto: CompleteTaskDto, staffId: string) {
    const task = await this.prisma.housekeepingTask.findUnique({
      where: { id: taskId },
      include: { checklist: true },
    });
    if (!task) throw DomainError.notFound('HousekeepingTask', taskId);
    assertTaskTransition(task.status as HousekeepingTaskStatus, HousekeepingTaskStatus.COMPLETED);

    const completedIds = new Set(
      dto.checklist.filter((item) => item.completed).map((item) => item.id),
    );
    const outstanding = task.checklist.filter(
      (item) => item.required && !item.completed && !completedIds.has(item.id),
    );
    if (outstanding.length > 0) {
      throw DomainError.conflict('Required checklist items are still outstanding.', {
        outstanding: outstanding.map((item) => item.label),
      });
    }

    const now = this.clock.now();
    const durationMinutes = task.startedAt
      ? Math.max(1, Math.round((now.getTime() - task.startedAt.getTime()) / 60_000))
      : EXPECTED_MINUTES[task.type as TaskType];

    // Two statements rather than one per item. Every statement inside an
    // interactive transaction is its own round trip, so a per-item loop makes
    // the cost of finishing a clean scale with the length of the checklist —
    // which is how a twelve-point checklist times the transaction out against a
    // database that is not on the same host.
    const ticked = dto.checklist.filter((item) => item.completed).map((item) => item.id);
    const unticked = dto.checklist.filter((item) => !item.completed).map((item) => item.id);

    return this.prisma.$transaction(async (tx) => {
      if (ticked.length > 0) {
        await tx.checklistItem.updateMany({
          where: { taskId, id: { in: ticked } },
          data: { completed: true },
        });
      }
      if (unticked.length > 0) {
        await tx.checklistItem.updateMany({
          where: { taskId, id: { in: unticked } },
          data: { completed: false },
        });
      }

      const completed = await tx.housekeepingTask.update({
        where: { id: taskId },
        data: {
          status: HousekeepingTaskStatus.COMPLETED,
          completedAt: now,
          durationMinutes,
          ...(dto.notes ? { notes: dto.notes } : {}),
        },
      });

      const event = buildEvent({
        eventId: `evt_${nanoid(20)}`,
        type: EventType.HOUSEKEEPING_TASK_COMPLETED,
        version: 1,
        source: this.env.SERVICE_NAME,
        correlationId: `hkc_${nanoid(16)}`,
        occurredAt: now,
        hotelId: task.hotelId,
        actor: { id: staffId, type: 'STAFF' },
        payload: {
          taskId: completed.id,
          hotelId: completed.hotelId,
          roomId: completed.roomId,
          roomNumber: completed.roomNumber,
          completedBy: staffId,
          completedAt: now.toISOString(),
          durationMinutes,
          // A checkout clean is inspected before the room returns to sale.
          inspectionRequired: completed.type === 'CHECKOUT_CLEAN',
        },
      });

      await tx.outboxEvent.create({
        data: {
          topic: Topic.HOUSEKEEPING,
          partitionKey: task.hotelId,
          eventType: event.type,
          payload: event as unknown as object,
        },
      });

      return completed;
    });
  }

  /** Inspection outcome. A failure returns the room to the queue as rework. */
  async verify(taskId: string, dto: VerifyTaskDto, inspectorId: string) {
    const task = await this.prisma.housekeepingTask.findUnique({ where: { id: taskId } });
    if (!task) throw DomainError.notFound('HousekeepingTask', taskId);

    const target = dto.passed ? HousekeepingTaskStatus.VERIFIED : HousekeepingTaskStatus.ASSIGNED;
    assertTaskTransition(task.status as HousekeepingTaskStatus, target);

    const now = this.clock.now();

    if (dto.passed) {
      return this.prisma.housekeepingTask.update({
        where: { id: taskId },
        data: {
          status: HousekeepingTaskStatus.VERIFIED,
          verifiedById: inspectorId,
          verifiedAt: now,
          ...(dto.notes ? { notes: dto.notes } : {}),
        },
      });
    }

    // Rework: reopen the same task at CRITICAL and clear the checklist so it is
    // genuinely redone rather than re-ticked.
    return this.prisma.$transaction(async (tx) => {
      await tx.checklistItem.updateMany({ where: { taskId }, data: { completed: false } });
      return tx.housekeepingTask.update({
        where: { id: taskId },
        data: {
          status: HousekeepingTaskStatus.ASSIGNED,
          priority: 'CRITICAL',
          reworkOfId: taskId,
          completedAt: null,
          startedAt: null,
          verifiedById: inspectorId,
          verifiedAt: now,
          notes: dto.notes ?? 'Failed inspection — re-clean required',
        },
      });
    });
  }

  async createShift(dto: CreateShiftDto) {
    if (new Date(dto.endsAt) <= new Date(dto.startsAt)) {
      throw DomainError.validation('A shift must end after it starts.');
    }
    return this.prisma.housekeeperShift.create({
      data: {
        ...dto,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
      },
    });
  }

  /** The housekeeping board — open work in the order it should be done. */
  async board(hotelId: string) {
    const tasks = await this.prisma.housekeepingTask.findMany({
      where: {
        hotelId,
        status: {
          in: [
            HousekeepingTaskStatus.PENDING,
            HousekeepingTaskStatus.ASSIGNED,
            HousekeepingTaskStatus.IN_PROGRESS,
            HousekeepingTaskStatus.COMPLETED,
          ],
        },
      },
      include: { checklist: { orderBy: { sortOrder: 'asc' } } },
    });

    return tasks.sort(compareTasks);
  }

  async list(query: ListTasksQuery) {
    const where = {
      hotelId: query.hotelId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.assignedToId ? { assignedToId: query.assignedToId } : {}),
      ...(query.floor !== undefined ? { floor: query.floor } : {}),
    };

    const [items, totalItems] = await Promise.all([
      this.prisma.housekeepingTask.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.housekeepingTask.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalItems / query.pageSize));
    return {
      data: items.sort(compareTasks),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages,
        hasNextPage: query.page < totalPages,
      },
    };
  }
}
