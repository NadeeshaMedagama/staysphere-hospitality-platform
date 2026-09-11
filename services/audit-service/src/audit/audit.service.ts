import { Inject, Injectable, Logger } from '@nestjs/common';
import { currentContext, type Principal } from '@staysphere/service-core';
import type { AuditEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { describeChange, diffRecords } from './diff.js';
import type { ListAuditQuery, RecordAuditDto } from './dto.js';

export const AUDIT_ENV = Symbol('AUDIT_ENV');
export const CLOCK = Symbol('CLOCK');

export interface Clock {
  now(): Date;
}

export interface ActorContext {
  readonly principal?: Principal;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

/**
 * The audit trail.
 *
 * Append-only: this service exposes no update or delete path, and none should
 * ever be added. A log that can be edited proves nothing.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUDIT_ENV) private readonly env: AuditEnv,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async record(dto: RecordAuditDto, actor: ActorContext) {
    const changes = diffRecords(dto.before, dto.after);
    const context = currentContext();

    return this.prisma.auditEntry.create({
      data: {
        actorId: actor.principal?.id ?? null,
        actorEmail: actor.principal?.email ?? null,
        actorRoles: actor.principal ? [...actor.principal.roles] : [],
        actorType: actor.principal ? 'USER' : 'SYSTEM',
        action: dto.action,
        resource: dto.resource,
        resourceId: dto.resourceId ?? null,
        hotelId: dto.hotelId ?? actor.principal?.hotelId ?? null,
        changes: changes as unknown as object,
        ipAddress: actor.ipAddress ?? null,
        userAgent: actor.userAgent ?? null,
        requestId: context?.requestId ?? null,
        correlationId: context?.correlationId ?? null,
        outcome: dto.outcome,
        failureCode: dto.failureCode ?? null,
        metadata: dto.metadata as object,
        occurredAt: this.clock.now(),
      },
    });
  }

  async list(query: ListAuditQuery) {
    const where = {
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.resource ? { resource: query.resource } : {}),
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      ...(query.hotelId ? { hotelId: query.hotelId } : {}),
      ...(query.action ? { action: { contains: query.action, mode: 'insensitive' as const } } : {}),
      ...(query.correlationId ? { correlationId: query.correlationId } : {}),
      ...(query.outcome ? { outcome: query.outcome } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, totalItems] = await Promise.all([
      this.prisma.auditEntry.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditEntry.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalItems / query.pageSize));
    return {
      data: items.map((entry) => ({
        ...entry,
        summary: (entry.changes as unknown as Parameters<typeof describeChange>[0][]).map(
          describeChange,
        ),
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

  /** Everything that happened to one record, oldest first. */
  async history(resource: string, resourceId: string) {
    const entries = await this.prisma.auditEntry.findMany({
      where: { resource, resourceId },
      orderBy: { occurredAt: 'asc' },
    });

    return entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      actorId: entry.actorId,
      actorEmail: entry.actorEmail,
      occurredAt: entry.occurredAt,
      outcome: entry.outcome,
      summary: (entry.changes as unknown as Parameters<typeof describeChange>[0][]).map(
        describeChange,
      ),
    }));
  }

  /**
   * Everything that happened during one distributed interaction.
   *
   * This is what makes an audit log usable during an incident: a single
   * correlation id reconstructs the whole chain across every service.
   */
  async trace(correlationId: string) {
    return this.prisma.auditEntry.findMany({
      where: { correlationId },
      orderBy: { occurredAt: 'asc' },
    });
  }
}
