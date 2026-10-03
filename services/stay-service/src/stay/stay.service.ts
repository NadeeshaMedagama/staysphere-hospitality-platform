import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DomainError,
  EventType,
  FolioLineKind,
  Topic,
  buildEvent,
  money,
} from '@staysphere/contracts';
import { nanoid } from 'nanoid';
import type { StayEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CheckInDto,
  CheckOutDto,
  ListStaysQuery,
  PostChargeDto,
  RequestServiceDto,
} from './dto.js';
import { buildFolioLine, computeFolioBalance, type FolioLine } from './folio.js';

export const STAY_ENV = Symbol('STAY_ENV');
export const CLOCK = Symbol('CLOCK');

export interface Clock {
  now(): Date;
}

@Injectable()
export class StayService {
  private readonly logger = new Logger(StayService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STAY_ENV) private readonly env: StayEnv,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Opens a stay.
   *
   * The stay, the opening room charge and the `stay.guest-checked-in` event are
   * written together: room-service moves the room to OCCUPIED off that event, so
   * a stay can never exist without the room reflecting it.
   */
  async checkIn(dto: CheckInDto, staffId: string) {
    const existing = await this.prisma.stay.findUnique({ where: { bookingId: dto.bookingId } });
    if (existing) {
      throw DomainError.conflict('This reservation has already been checked in.', {
        stayId: existing.id,
        bookingId: dto.bookingId,
      });
    }
    if (dto.guestNames.length > dto.adults + dto.children) {
      throw DomainError.validation('More guest names were supplied than the party size allows.');
    }

    const now = this.clock.now();

    const stay = await this.prisma.$transaction(async (tx) => {
      const created = await tx.stay.create({
        data: {
          bookingId: dto.bookingId,
          hotelId: dto.hotelId,
          customerId: dto.customerId,
          roomId: dto.roomId,
          roomNumber: dto.roomNumber,
          guestNames: dto.guestNames,
          adults: dto.adults,
          children: dto.children,
          checkedInAt: now,
          checkedInById: staffId,
          expectedCheckOut: new Date(dto.expectedCheckOut),
          currency: dto.currency,
          depositMinor: dto.depositMinor,
          notes: dto.notes ?? null,
        },
      });

      await tx.folioLine.create({
        data: {
          stayId: created.id,
          kind: FolioLineKind.ROOM,
          description: `Accommodation — room ${dto.roomNumber}`,
          quantity: 1,
          unitPriceMinor: dto.roomChargeMinor,
          amountMinor: dto.roomChargeMinor,
          currency: dto.currency,
          sourceId: dto.bookingId,
          postedById: staffId,
        },
      });

      const event = buildEvent({
        eventId: `evt_${nanoid(20)}`,
        type: EventType.GUEST_CHECKED_IN,
        version: 1,
        source: this.env.SERVICE_NAME,
        correlationId: `cin_${nanoid(16)}`,
        occurredAt: now,
        hotelId: dto.hotelId,
        actor: { id: staffId, type: 'STAFF' },
        payload: {
          stayId: created.id,
          bookingId: created.bookingId,
          hotelId: created.hotelId,
          roomId: created.roomId,
          roomNumber: created.roomNumber,
          checkedInAt: now.toISOString(),
          checkedInBy: staffId,
        },
      });

      await tx.outboxEvent.create({
        data: {
          topic: Topic.STAY,
          partitionKey: dto.hotelId,
          eventType: event.type,
          payload: event as unknown as object,
        },
      });

      return created;
    });

    this.logger.log({ stayId: stay.id, roomNumber: dto.roomNumber }, 'Guest checked in');
    return stay;
  }

  /**
   * Closes a stay.
   *
   * The `stay.guest-checked-out` event is what raises the housekeeping task and
   * triggers invoicing, so it must be written in the same transaction as the
   * status change — otherwise a departed guest leaves a room nobody cleans.
   */
  async checkOut(stayId: string, dto: CheckOutDto, staffId: string) {
    const stay = await this.prisma.stay.findUnique({
      where: { id: stayId },
      include: { folioLines: true },
    });
    if (!stay) throw DomainError.notFound('Stay', stayId);
    if (stay.status !== 'IN_HOUSE') {
      throw DomainError.conflict('This stay has already been closed.', { status: stay.status });
    }

    const now = this.clock.now();
    const lines: FolioLine[] = [...stay.folioLines];

    if (dto.settlementMinor > 0) {
      lines.push({
        kind: FolioLineKind.PAYMENT,
        amountMinor: dto.settlementMinor,
        currency: stay.currency,
      });
    }

    const balance = computeFolioBalance(lines, stay.currency);
    if (!balance.settled && !dto.allowUnsettled) {
      throw DomainError.conflict(
        'The folio is not settled. Take payment, or authorise departure with an open balance.',
        { balanceDueMinor: balance.balanceDue.amountMinor, currency: stay.currency },
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.settlementMinor > 0) {
        await tx.folioLine.create({
          data: {
            stayId,
            kind: FolioLineKind.PAYMENT,
            description: 'Settlement at check-out',
            quantity: 1,
            unitPriceMinor: dto.settlementMinor,
            amountMinor: dto.settlementMinor,
            currency: stay.currency,
            postedById: staffId,
          },
        });
      }

      const closed = await tx.stay.update({
        where: { id: stayId },
        data: {
          status: balance.settled ? 'CHECKED_OUT' : 'DEPARTED_UNSETTLED',
          checkedOutAt: now,
          checkedOutById: staffId,
          ...(dto.notes ? { notes: dto.notes } : {}),
        },
      });

      const event = buildEvent({
        eventId: `evt_${nanoid(20)}`,
        type: EventType.GUEST_CHECKED_OUT,
        version: 1,
        source: this.env.SERVICE_NAME,
        correlationId: `cout_${nanoid(16)}`,
        occurredAt: now,
        hotelId: stay.hotelId,
        actor: { id: staffId, type: 'STAFF' },
        payload: {
          stayId: closed.id,
          bookingId: closed.bookingId,
          hotelId: closed.hotelId,
          roomId: closed.roomId,
          roomNumber: closed.roomNumber,
          checkedOutAt: now.toISOString(),
          invoiceId: '',
          balanceDue: {
            amountMinor: balance.balanceDue.amountMinor,
            currency: balance.balanceDue.currency,
          },
        },
      });

      await tx.outboxEvent.create({
        data: {
          topic: Topic.STAY,
          partitionKey: stay.hotelId,
          eventType: event.type,
          payload: event as unknown as object,
        },
      });

      this.logger.log(
        { stayId, roomNumber: stay.roomNumber, balanceDue: balance.balanceDue.amountMinor },
        'Guest checked out',
      );
      return { stay: closed, balance };
    });
  }

  /** Adds a chargeable extra and posts it straight to the folio. */
  async requestService(stayId: string, dto: RequestServiceDto, requestedById: string) {
    const stay = await this.prisma.stay.findUnique({ where: { id: stayId } });
    if (!stay) throw DomainError.notFound('Stay', stayId);
    if (stay.status !== 'IN_HOUSE') {
      throw DomainError.conflict('Services can only be added to an in-house stay.');
    }

    const item = await this.prisma.serviceCatalogItem.findUnique({
      where: { hotelId_code: { hotelId: stay.hotelId, code: dto.serviceCode } },
    });
    if (!item || !item.available) {
      throw DomainError.notFound('Service', dto.serviceCode);
    }

    const now = this.clock.now();
    const charge = buildFolioLine({
      kind: FolioLineKind.SERVICE,
      description: item.name,
      quantity: dto.quantity,
      unitPrice: money(item.priceMinor, item.currency),
    });

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.serviceRequest.create({
        data: {
          stayId,
          serviceCode: dto.serviceCode,
          quantity: dto.quantity,
          unitPriceMinor: item.priceMinor,
          currency: item.currency,
          scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : null,
          notes: dto.notes ?? null,
          requestedById,
        },
      });

      await tx.folioLine.create({
        data: {
          stayId,
          kind: FolioLineKind.SERVICE,
          description: charge.description,
          quantity: charge.quantity,
          unitPriceMinor: charge.unitPriceMinor,
          amountMinor: charge.amountMinor,
          currency: charge.currency,
          sourceId: request.id,
          postedById: requestedById,
        },
      });

      const event = buildEvent({
        eventId: `evt_${nanoid(20)}`,
        type: EventType.SERVICE_REQUESTED,
        version: 1,
        source: this.env.SERVICE_NAME,
        correlationId: `svc_${nanoid(16)}`,
        occurredAt: now,
        hotelId: stay.hotelId,
        actor: { id: requestedById, type: 'USER' },
        payload: {
          requestId: request.id,
          stayId,
          hotelId: stay.hotelId,
          roomId: stay.roomId,
          serviceCode: dto.serviceCode,
          quantity: dto.quantity,
          unitPrice: { amountMinor: item.priceMinor, currency: item.currency },
          requestedBy: requestedById,
          scheduledFor: dto.scheduledFor ?? null,
        },
      });

      await tx.outboxEvent.create({
        data: {
          topic: Topic.STAY,
          partitionKey: stay.hotelId,
          eventType: event.type,
          payload: event as unknown as object,
        },
      });

      return request;
    });
  }

  /** Posts an arbitrary line — used for corrections and manual charges. */
  async postCharge(stayId: string, dto: PostChargeDto, staffId: string) {
    const stay = await this.prisma.stay.findUnique({ where: { id: stayId } });
    if (!stay) throw DomainError.notFound('Stay', stayId);

    const line = buildFolioLine({
      kind: dto.kind as FolioLineKind,
      description: dto.description,
      quantity: dto.quantity,
      unitPrice: money(dto.unitPriceMinor, stay.currency),
    });

    return this.prisma.folioLine.create({
      data: {
        stayId,
        kind: line.kind,
        description: line.description,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        amountMinor: line.amountMinor,
        currency: line.currency,
        postedById: staffId,
      },
    });
  }

  async folio(stayId: string) {
    const stay = await this.prisma.stay.findUnique({
      where: { id: stayId },
      include: {
        folioLines: { orderBy: { postedAt: 'asc' } },
        serviceRequests: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!stay) throw DomainError.notFound('Stay', stayId);

    return { stay, balance: computeFolioBalance(stay.folioLines, stay.currency) };
  }

  async list(query: ListStaysQuery) {
    const where = {
      ...(query.hotelId ? { hotelId: query.hotelId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, totalItems] = await Promise.all([
      this.prisma.stay.findMany({
        where,
        orderBy: { checkedInAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.stay.count({ where }),
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

  /** Everyone currently in the building — the front desk's core view. */
  async inHouse(hotelId: string) {
    return this.prisma.stay.findMany({
      where: { hotelId, status: 'IN_HOUSE' },
      orderBy: { roomNumber: 'asc' },
    });
  }
}
