import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  BookingStatus,
  DomainError,
  ErrorCode,
  EventType,
  Topic,
  buildEvent,
  canTransition,
  money,
} from '@staysphere/contracts';
import { nanoid } from 'nanoid';
import { randomInt } from 'node:crypto';
import type { BookingEnv } from '../config/env.js';
import {
  STANDARD_CANCELLATION_POLICY,
  allocateRoom,
  assertValidStay,
  assessRefund,
  findAvailableRooms,
  nightsBetween,
  quoteStay,
  type ExistingReservation,
  type Quote,
  type RatePlan,
  type RoomInventory,
} from '../domain/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  AvailabilityQuery,
  CancelBookingDto,
  CreateBookingDto,
  ListBookingsQuery,
} from './dto.js';
import { generateReference } from './reference.js';

export const BOOKING_ENV = Symbol('BOOKING_ENV');
export const CLOCK = Symbol('CLOCK');

export interface Clock {
  now(): Date;
}

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(BOOKING_ENV) private readonly env: BookingEnv,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Rooms of a type that are free for the requested dates, with a price. */
  async checkAvailability(query: AvailabilityQuery): Promise<{
    available: boolean;
    roomsLeft: number;
    quote: Quote | null;
  }> {
    const range = { checkIn: query.checkIn, checkOut: query.checkOut };
    assertValidStay(range, { now: this.clock.now(), maxNights: this.env.MAX_STAY_NIGHTS });

    const [rooms, reservations, ratePlan] = await Promise.all([
      this.loadRooms(query.hotelId, query.roomTypeId),
      this.loadOverlappingReservations(query.hotelId, query.roomTypeId, range),
      this.loadRatePlan(query.hotelId, query.roomTypeId),
    ]);

    const result = findAvailableRooms(rooms, reservations, {
      range,
      roomTypeId: query.roomTypeId,
      guests: query.adults + query.children,
    });

    return {
      available: result.available,
      roomsLeft: result.candidates.length,
      quote: result.available ? quoteStay(ratePlan, range) : null,
    };
  }

  /**
   * Creates a reservation.
   *
   * The room allocation, the booking row and the `booking.created` outbox entry
   * are written in one transaction. A unique index on `(roomId, dates)` is the
   * final arbiter: if two concurrent requests both pass the availability read,
   * the database rejects the loser, which is turned into ROOM_NOT_AVAILABLE
   * rather than a 500.
   */
  async create(
    dto: CreateBookingDto,
    customerId: string,
    idempotencyKey?: string,
  ): Promise<{ id: string; reference: string; status: BookingStatus; quote: Quote }> {
    const now = this.clock.now();
    const range = { checkIn: dto.checkIn, checkOut: dto.checkOut };
    assertValidStay(range, { now, maxNights: this.env.MAX_STAY_NIGHTS });

    if (idempotencyKey) {
      const existing = await this.prisma.booking.findUnique({ where: { idempotencyKey } });
      if (existing) {
        throw new DomainError(
          ErrorCode.IDEMPOTENCY_KEY_REUSED,
          'This booking request has already been processed.',
          { details: { bookingId: existing.id, reference: existing.reference } },
        );
      }
    }

    const [rooms, reservations, ratePlan] = await Promise.all([
      this.loadRooms(dto.hotelId, dto.roomTypeId),
      this.loadOverlappingReservations(dto.hotelId, dto.roomTypeId, range),
      this.loadRatePlan(dto.hotelId, dto.roomTypeId),
    ]);

    const guests = dto.adults + dto.children;
    const room = allocateRoom(rooms, reservations, {
      range,
      roomTypeId: dto.roomTypeId,
      guests,
    });

    const quote = quoteStay(ratePlan, range);
    const reference = generateReference((max) => randomInt(max));

    try {
      const booking = await this.prisma.$transaction(async (tx) => {
        const created = await tx.booking.create({
          data: {
            reference,
            hotelId: dto.hotelId,
            customerId,
            roomTypeId: dto.roomTypeId,
            roomId: room.id,
            checkIn: range.checkIn,
            checkOut: range.checkOut,
            nights: quote.nights,
            adults: dto.adults,
            children: dto.children,
            status: BookingStatus.PENDING,
            channel: dto.channel,
            currency: quote.currency,
            subtotalMinor: quote.subtotal.amountMinor,
            discountMinor: quote.discount.amountMinor,
            taxMinor: quote.tax.amountMinor,
            totalMinor: quote.total.amountMinor,
            guestName: dto.guestName,
            guestEmail: dto.guestEmail,
            guestPhone: dto.guestPhone ?? null,
            notes: dto.notes ?? null,
            promotionCode: dto.promotionCode ?? null,
            idempotencyKey: idempotencyKey ?? null,
            nightlyCharges: {
              create: quote.nightly.map((charge) => ({
                date: charge.date,
                rateKind: charge.kind,
                label: charge.label,
                amountMinor: charge.amount.amountMinor,
              })),
            },
          },
        });

        const event = buildEvent({
          eventId: `evt_${nanoid(20)}`,
          type: EventType.BOOKING_CREATED,
          version: 1,
          source: this.env.SERVICE_NAME,
          correlationId: `bkg_${nanoid(16)}`,
          occurredAt: now,
          hotelId: dto.hotelId,
          actor: { id: customerId, type: 'USER' },
          payload: {
            bookingId: created.id,
            reference: created.reference,
            hotelId: created.hotelId,
            customerId,
            roomTypeId: created.roomTypeId,
            roomId: created.roomId,
            checkIn: created.checkIn.toISOString(),
            checkOut: created.checkOut.toISOString(),
            nights: created.nights,
            adults: created.adults,
            children: created.children,
            total: { amountMinor: created.totalMinor, currency: created.currency },
            status: BookingStatus.PENDING,
          },
        });

        await tx.outboxEvent.create({
          data: {
            topic: Topic.BOOKING,
            partitionKey: created.hotelId,
            eventType: event.type,
            payload: event as unknown as object,
          },
        });

        return created;
      });

      this.logger.log(
        { bookingId: booking.id, reference: booking.reference, roomId: room.id },
        'Reservation created and holding inventory',
      );

      return {
        id: booking.id,
        reference: booking.reference,
        status: BookingStatus.PENDING,
        quote,
      };
    } catch (error) {
      if (isInventoryConflict(error)) {
        throw new DomainError(
          ErrorCode.ROOM_NOT_AVAILABLE,
          'That room was taken while your booking was being confirmed. Please try again.',
        );
      }
      throw error;
    }
  }

  async cancel(
    bookingId: string,
    actorId: string,
    dto: CancelBookingDto,
  ): Promise<{ status: BookingStatus; refundMinor: number; policy: string }> {
    const now = this.clock.now();
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw DomainError.notFound('Booking', bookingId);

    if (!canTransition(booking.status as BookingStatus, BookingStatus.CANCELLED)) {
      throw new DomainError(
        ErrorCode.BOOKING_NOT_CANCELLABLE,
        `A booking in status ${booking.status} can no longer be cancelled.`,
        { details: { status: booking.status } },
      );
    }

    const assessment = assessRefund(
      money(booking.paidMinor, booking.currency),
      booking.checkIn,
      now,
      STANDARD_CANCELLATION_POLICY,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: now,
          cancelledById: actorId,
          cancelReason: dto.reason ?? null,
          refundedMinor: assessment.refund.amountMinor,
        },
      });

      await tx.bookingStatusChange.create({
        data: {
          bookingId,
          from: booking.status,
          to: BookingStatus.CANCELLED,
          actorId,
          reason: dto.reason ?? null,
        },
      });

      const event = buildEvent({
        eventId: `evt_${nanoid(20)}`,
        type: EventType.BOOKING_CANCELLED,
        version: 1,
        source: this.env.SERVICE_NAME,
        correlationId: `cnl_${nanoid(16)}`,
        occurredAt: now,
        hotelId: booking.hotelId,
        actor: { id: actorId, type: 'USER' },
        payload: {
          bookingId: booking.id,
          reference: booking.reference,
          hotelId: booking.hotelId,
          customerId: booking.customerId,
          cancelledBy: actorId,
          ...(dto.reason ? { reason: dto.reason } : {}),
          refundDue: {
            amountMinor: assessment.refund.amountMinor,
            currency: assessment.refund.currency,
          },
          previousStatus: booking.status,
        },
      });

      await tx.outboxEvent.create({
        data: {
          topic: Topic.BOOKING,
          partitionKey: booking.hotelId,
          eventType: event.type,
          payload: event as unknown as object,
        },
      });
    });

    return {
      status: BookingStatus.CANCELLED,
      refundMinor: assessment.refund.amountMinor,
      policy: assessment.tier.label,
    };
  }

  async findById(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { nightlyCharges: { orderBy: { date: 'asc' } } },
    });
    if (!booking) throw DomainError.notFound('Booking', bookingId);
    return booking;
  }

  async list(query: ListBookingsQuery) {
    const where = {
      ...(query.hotelId ? { hotelId: query.hotelId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            checkIn: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };

    const [items, totalItems] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.booking.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalItems / query.pageSize));
    return {
      data: items,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages,
        hasNextPage: query.page < totalPages,
      },
    };
  }

  private async loadRooms(hotelId: string, roomTypeId: string): Promise<RoomInventory[]> {
    const rooms = await this.prisma.roomProjection.findMany({ where: { hotelId, roomTypeId } });
    return rooms.map((room) => ({
      id: room.id,
      roomNumber: room.roomNumber,
      roomTypeId: room.roomTypeId,
      status: room.status,
      maxOccupancy: room.maxOccupancy,
    }));
  }

  private async loadOverlappingReservations(
    hotelId: string,
    roomTypeId: string,
    range: { checkIn: Date; checkOut: Date },
  ): Promise<ExistingReservation[]> {
    // Half-open overlap pushed into SQL: only rows that can actually conflict
    // are read, rather than the property's whole booking history.
    const bookings = await this.prisma.booking.findMany({
      where: {
        hotelId,
        roomTypeId,
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN] },
        checkIn: { lt: range.checkOut },
        checkOut: { gt: range.checkIn },
      },
      select: { roomId: true, roomTypeId: true, status: true, checkIn: true, checkOut: true },
    });
    return bookings as ExistingReservation[];
  }

  private async loadRatePlan(hotelId: string, roomTypeId: string): Promise<RatePlan> {
    const plan = await this.prisma.ratePlanProjection.findUnique({
      where: { hotelId_roomTypeId: { hotelId, roomTypeId } },
    });
    if (!plan) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        'No published rate plan exists for this room type.',
        { details: { hotelId, roomTypeId } },
      );
    }
    return {
      roomTypeId: plan.roomTypeId,
      currency: plan.currency,
      baseRateMinor: plan.baseRateMinor,
      weekendMultiplier: Number(plan.weekendMultiplier),
      taxBasisPoints: plan.taxBasisPoints,
      seasonalRates: (
        plan.seasonalRates as unknown as Array<{
          label: string;
          from: string;
          to: string;
          nightlyRateMinor: number;
        }>
      ).map((season) => ({
        label: season.label,
        from: new Date(season.from),
        to: new Date(season.to),
        nightlyRateMinor: season.nightlyRateMinor,
      })),
      longStayDiscounts: plan.longStayDiscounts as unknown as Array<{
        minNights: number;
        percentOff: number;
      }>,
    };
  }
}

/**
 * Whether the database refused the insert because the room was already taken.
 *
 * Two constraints can produce this: the `idempotencyKey` unique index (Prisma
 * reports P2002) and the `bookings_no_overlapping_stay` exclusion constraint
 * (PostgreSQL SQLSTATE 23P01, which Prisma surfaces without a P-code). Both
 * mean the same thing to the caller, so both map to ROOM_NOT_AVAILABLE rather
 * than a 500.
 */
function isInventoryConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const code = (error as { code?: unknown }).code;
  if (code === 'P2002') return true;

  const message = (error as { message?: unknown }).message;
  return (
    typeof message === 'string' &&
    (message.includes('23P01') || message.includes('bookings_no_overlapping_stay'))
  );
}

export { nightsBetween };
