import { Inject, Injectable, Logger } from '@nestjs/common';
import { DomainError, EventType, RoomStatus, Topic, buildEvent } from '@staysphere/contracts';
import { nanoid } from 'nanoid';
import type { RoomEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  BlockRoomDto,
  ChangeRoomStatusDto,
  CreateRoomDto,
  CreateRoomTypeDto,
  GenerateFloorDto,
  ListRoomsQuery,
} from './dto.js';
import { compareRoomNumbers, deriveFloor, generateRoomNumbers } from './room-number.js';
import { assertRoomTransition, isSellable } from './room-status.js';

export const ROOM_ENV = Symbol('ROOM_ENV');
export const CLOCK = Symbol('CLOCK');

export interface Clock {
  now(): Date;
}

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ROOM_ENV) private readonly env: RoomEnv,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async createRoomType(dto: CreateRoomTypeDto) {
    if (dto.maxAdults + dto.maxChildren < dto.maxOccupancy) {
      throw DomainError.validation(
        'maxOccupancy cannot exceed the combined adult and child limits.',
        { maxOccupancy: dto.maxOccupancy, maxAdults: dto.maxAdults, maxChildren: dto.maxChildren },
      );
    }
    const duplicate = await this.prisma.roomType.findUnique({
      where: { hotelId_code: { hotelId: dto.hotelId, code: dto.code } },
    });
    if (duplicate) {
      throw DomainError.conflict('That room type already exists at this property.', {
        code: dto.code,
      });
    }
    return this.prisma.roomType.create({ data: dto });
  }

  /**
   * The room types a property sells, for the public booking page.
   *
   * Only active types, and only those with at least one sellable room behind
   * them: offering a type the property cannot actually let is how a guest
   * reaches the payment step and then gets turned away.
   */
  async listRoomTypes(hotelId: string) {
    const types = await this.prisma.roomType.findMany({
      where: { hotelId, active: true },
      include: { rooms: { select: { id: true, status: true, blocked: true, blockedUntil: true } } },
      orderBy: { code: 'asc' },
    });

    const now = this.clock.now();

    return types.map(({ rooms, ...type }) => ({
      ...type,
      roomCount: rooms.length,
      sellableRoomCount: rooms.filter((room) =>
        isSellable(room.status as RoomStatus, room.blocked, room.blockedUntil, now),
      ).length,
    }));
  }

  async createRoom(dto: CreateRoomDto) {
    const roomType = await this.prisma.roomType.findUnique({ where: { id: dto.roomTypeId } });
    if (!roomType) throw DomainError.notFound('RoomType', dto.roomTypeId);

    const floor = dto.floor ?? deriveFloor(dto.roomNumber);
    if (floor === null) {
      throw DomainError.validation(
        `The floor cannot be derived from room number '${dto.roomNumber}'. Supply it explicitly.`,
        { roomNumber: dto.roomNumber },
      );
    }

    const room = await this.prisma.room.create({
      data: {
        hotelId: dto.hotelId,
        branchId: dto.branchId ?? null,
        roomNumber: dto.roomNumber,
        floor,
        building: dto.building ?? null,
        roomTypeId: dto.roomTypeId,
        maxOccupancy: dto.maxOccupancy ?? roomType.maxOccupancy,
        amenities: dto.amenities,
      },
    });

    await this.publishRoomUpserted(room);
    return room;
  }

  /**
   * Creates a whole floor in one transaction.
   *
   * All-or-nothing on purpose: a partially created floor leaves gaps that are
   * far harder to spot than an outright failure.
   */
  async generateFloor(dto: GenerateFloorDto) {
    const roomType = await this.prisma.roomType.findUnique({ where: { id: dto.roomTypeId } });
    if (!roomType) throw DomainError.notFound('RoomType', dto.roomTypeId);

    const numbers = generateRoomNumbers({
      floor: dto.floor,
      count: dto.count,
      startAt: dto.startAt,
    });

    const existing = await this.prisma.room.findMany({
      where: { hotelId: dto.hotelId, roomNumber: { in: numbers } },
      select: { roomNumber: true },
    });
    if (existing.length > 0) {
      throw DomainError.conflict('Some of those room numbers already exist.', {
        conflicts: existing.map((room) => room.roomNumber),
      });
    }

    const created = await this.prisma.$transaction(
      numbers.map((roomNumber) =>
        this.prisma.room.create({
          data: {
            hotelId: dto.hotelId,
            roomNumber,
            floor: dto.floor,
            roomTypeId: dto.roomTypeId,
            maxOccupancy: roomType.maxOccupancy,
          },
        }),
      ),
    );

    for (const room of created) await this.publishRoomUpserted(room);
    this.logger.log(
      { hotelId: dto.hotelId, floor: dto.floor, count: created.length },
      'Floor created',
    );
    return created;
  }

  /**
   * Changes a room's operational status.
   *
   * The transition is validated, recorded in history and announced in one
   * transaction, so the floor board and every downstream projection see the same
   * sequence of changes.
   */
  async changeStatus(roomId: string, dto: ChangeRoomStatusDto, actorId: string) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw DomainError.notFound('Room', roomId);

    assertRoomTransition(room.status as RoomStatus, dto.status);
    const now = this.clock.now();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.room.update({
        where: { id: roomId },
        data: { status: dto.status, statusNote: dto.note ?? null },
      });

      await tx.roomStatusChange.create({
        data: {
          roomId,
          from: room.status,
          to: dto.status,
          actorId,
          reason: dto.reason ?? null,
        },
      });

      const event = buildEvent({
        eventId: `evt_${nanoid(20)}`,
        type: EventType.ROOM_STATUS_CHANGED,
        version: 1,
        source: this.env.SERVICE_NAME,
        correlationId: `rms_${nanoid(16)}`,
        occurredAt: now,
        hotelId: room.hotelId,
        actor: { id: actorId, type: 'STAFF' },
        payload: {
          roomId: updated.id,
          hotelId: updated.hotelId,
          roomNumber: updated.roomNumber,
          previousStatus: room.status,
          status: updated.status,
          changedBy: actorId,
          ...(dto.reason ? { reason: dto.reason } : {}),
        },
      });

      await tx.outboxEvent.create({
        data: {
          topic: Topic.INVENTORY,
          partitionKey: room.hotelId,
          eventType: event.type,
          payload: event as unknown as object,
        },
      });

      return updated;
    });
  }

  async block(roomId: string, dto: BlockRoomDto, actorId: string) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw DomainError.notFound('Room', roomId);
    if (room.status === RoomStatus.OCCUPIED) {
      throw DomainError.conflict('An occupied room cannot be blocked; move the guest first.', {
        roomId,
      });
    }
    this.logger.log({ roomId, actorId, reason: dto.reason }, 'Room withheld from sale');
    return this.prisma.room.update({
      where: { id: roomId },
      data: {
        blocked: true,
        blockedUntil: dto.until ? new Date(dto.until) : null,
        blockReason: dto.reason,
      },
    });
  }

  async unblock(roomId: string) {
    if (!(await this.prisma.room.findUnique({ where: { id: roomId } }))) {
      throw DomainError.notFound('Room', roomId);
    }
    return this.prisma.room.update({
      where: { id: roomId },
      data: { blocked: false, blockedUntil: null, blockReason: null },
    });
  }

  async findById(roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        roomType: true,
        statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!room) throw DomainError.notFound('Room', roomId);
    return room;
  }

  async list(query: ListRoomsQuery) {
    const where = {
      hotelId: query.hotelId,
      ...(query.floor !== undefined ? { floor: query.floor } : {}),
      ...(query.roomTypeId ? { roomTypeId: query.roomTypeId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, totalItems] = await Promise.all([
      this.prisma.room.findMany({
        where,
        include: { roomType: { select: { code: true, name: true } } },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.room.count({ where }),
    ]);

    const now = this.clock.now();
    const totalPages = Math.max(1, Math.ceil(totalItems / query.pageSize));

    return {
      data: items
        .sort((a, b) => compareRoomNumbers(a.roomNumber, b.roomNumber))
        .map((room) => ({
          ...room,
          sellable: isSellable(room.status as RoomStatus, room.blocked, room.blockedUntil, now),
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

  /** Rooms grouped by floor — the shape the operations console's board needs. */
  async floorBoard(hotelId: string) {
    const rooms = await this.prisma.room.findMany({
      where: { hotelId },
      include: { roomType: { select: { code: true, name: true } } },
    });

    const now = this.clock.now();
    const byFloor = new Map<number, typeof rooms>();
    for (const room of rooms) {
      const bucket = byFloor.get(room.floor) ?? [];
      bucket.push(room);
      byFloor.set(room.floor, bucket);
    }

    return [...byFloor.entries()]
      .sort(([a], [b]) => a - b)
      .map(([floor, floorRooms]) => ({
        floor,
        rooms: floorRooms
          .sort((a, b) => compareRoomNumbers(a.roomNumber, b.roomNumber))
          .map((room) => ({
            id: room.id,
            number: room.roomNumber,
            status: room.status,
            note: room.statusNote,
            roomType: room.roomType.name,
            sellable: isSellable(room.status as RoomStatus, room.blocked, room.blockedUntil, now),
          })),
      }));
  }

  private async publishRoomUpserted(room: {
    id: string;
    hotelId: string;
    roomNumber: string;
    roomTypeId: string;
    floor: number;
    status: string;
    maxOccupancy: number;
  }): Promise<void> {
    const event = buildEvent({
      eventId: `evt_${nanoid(20)}`,
      type: EventType.ROOM_UPSERTED,
      version: 1,
      source: this.env.SERVICE_NAME,
      correlationId: `rmu_${nanoid(16)}`,
      occurredAt: this.clock.now(),
      hotelId: room.hotelId,
      payload: {
        roomId: room.id,
        hotelId: room.hotelId,
        roomNumber: room.roomNumber,
        roomTypeId: room.roomTypeId,
        floor: room.floor,
        status: room.status as RoomStatus,
        maxOccupancy: room.maxOccupancy,
      },
    });

    await this.prisma.outboxEvent.create({
      data: {
        topic: Topic.INVENTORY,
        partitionKey: room.hotelId,
        eventType: event.type,
        payload: event as unknown as object,
      },
    });
  }
}
