import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DomainError,
  EventType,
  type MaintenancePriority,
  MaintenanceStatus,
  Topic,
  buildEvent,
} from '@staysphere/contracts';
import { nanoid } from 'nanoid';
import type { MaintenanceEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  AssignTicketDto,
  CommentDto,
  CreateTicketDto,
  ListTicketsQuery,
  ResolveTicketDto,
} from './dto.js';
import { assertTicketTransition, dueAt, hoursRemaining, isBreached, triage } from './sla.js';

export const MAINTENANCE_ENV = Symbol('MAINTENANCE_ENV');
export const CLOCK = Symbol('CLOCK');

export interface Clock {
  now(): Date;
}

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAINTENANCE_ENV) private readonly env: MaintenanceEnv,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async create(dto: CreateTicketDto, reportedById: string, reportedByRole?: string) {
    const now = this.clock.now();
    const assessment = triage({
      category: dto.category,
      roomOccupied: dto.roomOccupied,
      arrivalImminent: dto.arrivalImminent,
      ...(dto.reportedPriority ? { reportedPriority: dto.reportedPriority } : {}),
    });

    const ticket = await this.prisma.$transaction(async (tx) => {
      const created = await tx.maintenanceTicket.create({
        data: {
          hotelId: dto.hotelId,
          roomId: dto.roomId ?? null,
          roomNumber: dto.roomNumber ?? null,
          location: dto.location ?? null,
          category: dto.category,
          summary: dto.summary,
          details: dto.details ?? null,
          priority: assessment.priority,
          takesRoomOffline: assessment.takesRoomOffline,
          dueAt: dueAt(now, assessment.priority),
          reportedById,
          reportedByRole: reportedByRole ?? null,
        },
      });

      const event = buildEvent({
        eventId: `evt_${nanoid(20)}`,
        type: EventType.MAINTENANCE_TICKET_CREATED,
        version: 1,
        source: this.env.SERVICE_NAME,
        correlationId: `mt_${nanoid(16)}`,
        occurredAt: now,
        hotelId: dto.hotelId,
        actor: { id: reportedById, type: 'STAFF' },
        payload: {
          ticketId: created.id,
          hotelId: created.hotelId,
          roomId: created.roomId,
          category: created.category,
          priority: created.priority,
          summary: created.summary,
          reportedBy: reportedById,
        },
      });

      await tx.outboxEvent.create({
        data: {
          topic: Topic.MAINTENANCE,
          partitionKey: dto.hotelId,
          eventType: event.type,
          payload: event as unknown as object,
        },
      });

      return created;
    });

    this.logger.log(
      { ticketId: ticket.id, priority: assessment.priority, offline: assessment.takesRoomOffline },
      'Maintenance ticket raised',
    );
    return ticket;
  }

  async assign(ticketId: string, dto: AssignTicketDto) {
    const ticket = await this.prisma.maintenanceTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw DomainError.notFound('MaintenanceTicket', ticketId);
    assertTicketTransition(ticket.status as MaintenanceStatus, MaintenanceStatus.ASSIGNED);

    return this.prisma.maintenanceTicket.update({
      where: { id: ticketId },
      data: {
        status: MaintenanceStatus.ASSIGNED,
        assignedToId: dto.staffId,
        assignedToName: dto.staffName,
        assignedAt: this.clock.now(),
      },
    });
  }

  async start(ticketId: string, staffId: string) {
    const ticket = await this.prisma.maintenanceTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw DomainError.notFound('MaintenanceTicket', ticketId);
    if (ticket.assignedToId !== staffId) {
      throw DomainError.forbidden('This ticket is assigned to someone else.');
    }
    assertTicketTransition(ticket.status as MaintenanceStatus, MaintenanceStatus.IN_PROGRESS);

    return this.prisma.maintenanceTicket.update({
      where: { id: ticketId },
      data: { status: MaintenanceStatus.IN_PROGRESS, startedAt: this.clock.now() },
    });
  }

  /**
   * Resolves a ticket.
   *
   * The event carries `roomReturnedToService`, which room-service consumes to
   * bring the room back from MAINTENANCE — so an engineer finishing the job is
   * what makes the room sellable again, with no second manual step to forget.
   */
  async resolve(ticketId: string, dto: ResolveTicketDto, resolvedById: string) {
    const ticket = await this.prisma.maintenanceTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw DomainError.notFound('MaintenanceTicket', ticketId);
    assertTicketTransition(ticket.status as MaintenanceStatus, MaintenanceStatus.RESOLVED);

    const now = this.clock.now();

    return this.prisma.$transaction(async (tx) => {
      const resolved = await tx.maintenanceTicket.update({
        where: { id: ticketId },
        data: {
          status: MaintenanceStatus.RESOLVED,
          resolvedAt: now,
          resolvedById,
          resolutionNotes: dto.resolutionNotes,
          costMinor: dto.costMinor,
          currency: dto.currency ?? null,
        },
      });

      const event = buildEvent({
        eventId: `evt_${nanoid(20)}`,
        type: EventType.MAINTENANCE_TICKET_RESOLVED,
        version: 1,
        source: this.env.SERVICE_NAME,
        correlationId: `mtr_${nanoid(16)}`,
        occurredAt: now,
        hotelId: ticket.hotelId,
        actor: { id: resolvedById, type: 'STAFF' },
        payload: {
          ticketId: resolved.id,
          hotelId: resolved.hotelId,
          roomId: resolved.roomId,
          resolvedBy: resolvedById,
          resolvedAt: now.toISOString(),
          resolutionNotes: dto.resolutionNotes,
          // Only meaningful if the fault took the room offline to begin with.
          roomReturnedToService: dto.returnRoomToService && resolved.takesRoomOffline,
        },
      });

      await tx.outboxEvent.create({
        data: {
          topic: Topic.MAINTENANCE,
          partitionKey: ticket.hotelId,
          eventType: event.type,
          payload: event as unknown as object,
        },
      });

      return resolved;
    });
  }

  async close(ticketId: string) {
    const ticket = await this.prisma.maintenanceTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw DomainError.notFound('MaintenanceTicket', ticketId);
    assertTicketTransition(ticket.status as MaintenanceStatus, MaintenanceStatus.CLOSED);

    return this.prisma.maintenanceTicket.update({
      where: { id: ticketId },
      data: { status: MaintenanceStatus.CLOSED, closedAt: this.clock.now() },
    });
  }

  async comment(ticketId: string, dto: CommentDto, authorId: string) {
    if (!(await this.prisma.maintenanceTicket.findUnique({ where: { id: ticketId } }))) {
      throw DomainError.notFound('MaintenanceTicket', ticketId);
    }
    return this.prisma.ticketComment.create({
      data: { ticketId, authorId, body: dto.body, internal: dto.internal },
    });
  }

  async findById(ticketId: string) {
    const ticket = await this.prisma.maintenanceTicket.findUnique({
      where: { id: ticketId },
      include: { comments: { orderBy: { createdAt: 'asc' } } },
    });
    if (!ticket) throw DomainError.notFound('MaintenanceTicket', ticketId);

    const now = this.clock.now();
    return {
      ...ticket,
      overdue: isBreached(ticket.dueAt, ticket.status as MaintenanceStatus, now),
      hoursRemaining: hoursRemaining(ticket.dueAt, now),
    };
  }

  async list(query: ListTicketsQuery) {
    const now = this.clock.now();
    const where = {
      hotelId: query.hotelId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.assignedToId ? { assignedToId: query.assignedToId } : {}),
      ...(query.roomId ? { roomId: query.roomId } : {}),
      ...(query.overdueOnly
        ? {
            dueAt: { lt: now },
            status: {
              in: [
                MaintenanceStatus.REPORTED,
                MaintenanceStatus.ASSIGNED,
                MaintenanceStatus.IN_PROGRESS,
              ],
            },
          }
        : {}),
    };

    const [items, totalItems] = await Promise.all([
      this.prisma.maintenanceTicket.findMany({
        where,
        // Most urgent first, then closest to breaching.
        orderBy: [{ priority: 'asc' }, { dueAt: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.maintenanceTicket.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalItems / query.pageSize));
    return {
      data: items.map((ticket) => ({
        ...ticket,
        overdue: isBreached(ticket.dueAt, ticket.status as MaintenanceStatus, now),
        hoursRemaining: hoursRemaining(ticket.dueAt, now),
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages,
        hasNextPage: query.page < totalPages,
      },
    };
  }

  /** Counts by priority and SLA state — the engineering dashboard's summary. */
  async summary(hotelId: string) {
    const now = this.clock.now();
    const open = await this.prisma.maintenanceTicket.findMany({
      where: {
        hotelId,
        status: {
          in: [
            MaintenanceStatus.REPORTED,
            MaintenanceStatus.ASSIGNED,
            MaintenanceStatus.IN_PROGRESS,
          ],
        },
      },
      select: { priority: true, dueAt: true, status: true, takesRoomOffline: true },
    });

    const byPriority: Record<string, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };
    let overdue = 0;
    let roomsOffline = 0;

    for (const ticket of open) {
      byPriority[ticket.priority] = (byPriority[ticket.priority] ?? 0) + 1;
      if (isBreached(ticket.dueAt, ticket.status as MaintenanceStatus, now)) overdue += 1;
      if (ticket.takesRoomOffline) roomsOffline += 1;
    }

    return {
      open: open.length,
      byPriority: byPriority as Record<MaintenancePriority, number>,
      overdue,
      roomsOffline,
    };
  }
}
