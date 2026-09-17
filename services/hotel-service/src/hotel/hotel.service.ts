import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DomainError,
  ErrorCode,
  EventType,
  Topic,
  buildEvent,
  type HotelPolicy,
} from '@staysphere/contracts';
import { nanoid } from 'nanoid';
import type { HotelEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateBranchDto, CreateHotelDto, ListHotelsQuery, UpdateHotelDto } from './dto.js';
import { assertPolicyCoherent } from './policy.js';
import { isValidSlug, resolveSlug } from './slug.js';

export const HOTEL_ENV = Symbol('HOTEL_ENV');
export const CLOCK = Symbol('CLOCK');

export interface Clock {
  now(): Date;
}

@Injectable()
export class HotelService {
  private readonly logger = new Logger(HotelService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(HOTEL_ENV) private readonly env: HotelEnv,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async create(dto: CreateHotelDto, actorId: string) {
    assertPolicyCoherent(dto.policy as HotelPolicy);

    const slug = dto.slug ?? resolveSlug(dto.name, await this.takenSlugs(dto.name));
    if (!isValidSlug(slug)) {
      throw DomainError.validation('The supplied web address is not usable.', { slug });
    }
    if (await this.prisma.hotel.findUnique({ where: { slug } })) {
      throw DomainError.conflict('That web address is already in use.', { slug });
    }

    const hotel = await this.prisma.hotel.create({
      data: {
        slug,
        name: dto.name,
        legalName: dto.legalName ?? null,
        description: dto.description ?? null,
        starRating: dto.starRating ?? null,
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2 ?? null,
        city: dto.city,
        region: dto.region ?? null,
        postalCode: dto.postalCode ?? null,
        countryCode: dto.countryCode,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        timezone: dto.timezone,
        email: dto.email,
        phone: dto.phone,
        websiteUrl: dto.websiteUrl ?? null,
        currency: dto.currency,
        policy: dto.policy,
        amenities: { create: dto.amenities.map((code) => ({ code })) },
      },
      include: { amenities: true },
    });

    this.logger.log({ hotelId: hotel.id, slug, actorId }, 'Property created');
    return hotel;
  }

  async update(hotelId: string, dto: UpdateHotelDto) {
    const existing = await this.prisma.hotel.findUnique({ where: { id: hotelId } });
    if (!existing) throw DomainError.notFound('Hotel', hotelId);
    if (dto.policy) assertPolicyCoherent(dto.policy as HotelPolicy);

    const { amenities, policy, ...rest } = dto;

    return this.prisma.$transaction(async (tx) => {
      if (amenities) {
        // Replace wholesale: a PATCH of the amenity list is a declaration of the
        // full set, not an addition to it.
        await tx.hotelAmenity.deleteMany({ where: { hotelId } });
        await tx.hotelAmenity.createMany({
          data: amenities.map((code) => ({ hotelId, code })),
        });
      }
      return tx.hotel.update({
        where: { id: hotelId },
        data: { ...rest, ...(policy ? { policy } : {}) },
        include: { amenities: true, branches: true },
      });
    });
  }

  /**
   * Moves a property to ACTIVE and announces it.
   *
   * Publishing is what makes a property bookable, so the transition and the
   * event are written together — a property can never be live without search
   * and booking having been told.
   */
  async publish(hotelId: string, actorId: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
      include: { amenities: true },
    });
    if (!hotel) throw DomainError.notFound('Hotel', hotelId);

    if (hotel.status === 'ACTIVE') {
      throw DomainError.conflict('This property is already published.', { hotelId });
    }
    if (hotel.status === 'CLOSED') {
      throw new DomainError(
        ErrorCode.CONFLICT,
        'A closed property cannot be republished; create a new one.',
        { details: { hotelId } },
      );
    }
    assertPolicyCoherent(hotel.policy as unknown as HotelPolicy);

    const now = this.clock.now();

    return this.prisma.$transaction(async (tx) => {
      const published = await tx.hotel.update({
        where: { id: hotelId },
        data: { status: 'ACTIVE' },
        include: { amenities: true },
      });

      const event = buildEvent({
        eventId: `evt_${nanoid(20)}`,
        type: EventType.HOTEL_PUBLISHED,
        version: 1,
        source: this.env.SERVICE_NAME,
        correlationId: `htl_${nanoid(16)}`,
        occurredAt: now,
        hotelId,
        actor: { id: actorId, type: 'STAFF' },
        payload: {
          hotelId: published.id,
          name: published.name,
          slug: published.slug,
          city: published.city,
          countryCode: published.countryCode,
          amenities: published.amenities.map((amenity) => amenity.code),
          status: published.status,
        },
      });

      await tx.outboxEvent.create({
        data: {
          topic: Topic.HOTEL,
          partitionKey: hotelId,
          eventType: event.type,
          payload: event as unknown as object,
        },
      });

      return published;
    });
  }

  async findById(hotelId: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
      include: { amenities: true, branches: true, images: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!hotel) throw DomainError.notFound('Hotel', hotelId);
    return hotel;
  }

  async findBySlug(slug: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { slug },
      include: { amenities: true, images: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!hotel || hotel.status !== 'ACTIVE') throw DomainError.notFound('Hotel', slug);
    return hotel;
  }

  async list(query: ListHotelsQuery, includeUnpublished = false) {
    const where = {
      ...(query.city ? { city: { equals: query.city, mode: 'insensitive' as const } } : {}),
      ...(query.countryCode ? { countryCode: query.countryCode } : {}),
      // Guests only ever see live properties; staff can ask for the rest.
      ...(query.status && includeUnpublished
        ? { status: query.status }
        : includeUnpublished
          ? {}
          : { status: 'ACTIVE' as const }),
      ...(query.amenity ? { amenities: { some: { code: query.amenity } } } : {}),
    };

    const [items, totalItems] = await Promise.all([
      this.prisma.hotel.findMany({
        where,
        include: { amenities: true },
        orderBy: [{ starRating: 'desc' }, { name: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.hotel.count({ where }),
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

  async addBranch(hotelId: string, dto: CreateBranchDto) {
    if (!(await this.prisma.hotel.findUnique({ where: { id: hotelId } }))) {
      throw DomainError.notFound('Hotel', hotelId);
    }
    const duplicate = await this.prisma.branch.findUnique({
      where: { hotelId_code: { hotelId, code: dto.code } },
    });
    if (duplicate) {
      throw DomainError.conflict('A branch with that code already exists.', { code: dto.code });
    }
    return this.prisma.branch.create({ data: { hotelId, ...dto } });
  }

  /** Existing slugs that could collide with the one derived from `name`. */
  private async takenSlugs(name: string): Promise<Set<string>> {
    const prefix = name
      .toLowerCase()
      .slice(0, 12)
      .replace(/[^a-z0-9]/g, '');
    const rows = await this.prisma.hotel.findMany({
      where: { slug: { startsWith: prefix } },
      select: { slug: true },
    });
    return new Set(rows.map((row) => row.slug));
  }
}
