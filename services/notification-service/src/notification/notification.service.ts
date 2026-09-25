import { Inject, Injectable, Logger } from '@nestjs/common';
import { DomainError, NotificationChannel, type TemplateKey } from '@staysphere/contracts';
import type { NotificationEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  ListNotificationsQuery,
  SendNotificationDto,
  UpdatePreferenceDto,
  UpsertTemplateDto,
} from './dto.js';
import { dedupeKey, routeNotification, type RecipientPreference } from './routing.js';
import { extractTokens, renderTemplate } from './template.js';

export const NOTIFICATION_ENV = Symbol('NOTIFICATION_ENV');
export const CLOCK = Symbol('CLOCK');

export interface Clock {
  now(): Date;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_ENV) private readonly env: NotificationEnv,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Queues a message on every channel that survives routing.
   *
   * The dedupe key is `(eventId, recipient, channel)` under a unique index, so a
   * redelivered Kafka message cannot send the guest a second confirmation — the
   * insert simply loses.
   */
  async send(dto: SendNotificationDto) {
    const preferences = (await this.prisma.notificationPreference.findMany({
      where: { recipientId: dto.recipientId },
      select: { channel: true, template: true, enabled: true },
    })) as RecipientPreference[];

    const decision = routeNotification({
      template: dto.template as TemplateKey,
      preferred: dto.channels,
      preferences,
      hasEmail: dto.toAddress.includes('@'),
      hasPhone: /^\+?[0-9]/.test(dto.toAddress),
      hasPushToken: false,
    });

    const queued: Array<{ id: string; channel: NotificationChannel }> = [];

    for (const channel of decision.channels) {
      const template = await this.prisma.notificationTemplate.findUnique({
        where: {
          key_channel_locale: { key: dto.template, channel, locale: dto.locale },
        },
      });

      if (!template || !template.active) {
        this.logger.warn(
          { template: dto.template, channel, locale: dto.locale },
          'No active template for this channel; skipping',
        );
        continue;
      }

      const rendered = renderTemplate(
        {
          key: template.key,
          subject: template.subject,
          body: template.body,
          required: template.required,
        },
        dto.values,
        // In-app messages render into a React tree that escapes for us; email
        // and SMS bodies are assembled here and must be escaped.
        { escape: channel !== NotificationChannel.IN_APP },
      );

      const key = dedupeKey(dto.eventId, dto.recipientId, channel);
      const existing = await this.prisma.notification.findUnique({ where: { dedupeKey: key } });
      if (existing) {
        this.logger.debug({ dedupeKey: key }, 'Duplicate notification suppressed');
        continue;
      }

      const created = await this.prisma.notification.create({
        data: {
          recipientId: dto.recipientId,
          toAddress: dto.toAddress,
          channel,
          template: dto.template,
          locale: dto.locale,
          subject: rendered.subject,
          body: rendered.body,
          dedupeKey: key,
          hotelId: dto.hotelId ?? null,
        },
      });
      queued.push({ id: created.id, channel });
    }

    // Record what was deliberately withheld, so "why did I not get an email?"
    // has an answer.
    for (const channel of decision.suppressed) {
      const key = dedupeKey(dto.eventId, dto.recipientId, channel);
      await this.prisma.notification
        .create({
          data: {
            recipientId: dto.recipientId,
            toAddress: dto.toAddress,
            channel,
            template: dto.template,
            locale: dto.locale,
            body: '',
            status: 'SUPPRESSED',
            dedupeKey: key,
            hotelId: dto.hotelId ?? null,
          },
        })
        .catch(() => undefined);
    }

    return { queued, suppressed: decision.suppressed };
  }

  async upsertTemplate(dto: UpsertTemplateDto) {
    const tokens = extractTokens({ subject: dto.subject ?? null, body: dto.body });
    const unknownRequired = dto.required.filter((token) => !tokens.includes(token));
    if (unknownRequired.length > 0) {
      throw DomainError.validation('Required tokens must actually appear in the template.', {
        unknownRequired,
        tokensInTemplate: tokens,
      });
    }

    return this.prisma.notificationTemplate.upsert({
      where: {
        key_channel_locale: { key: dto.key, channel: dto.channel, locale: dto.locale },
      },
      create: { ...dto, subject: dto.subject ?? null },
      update: { ...dto, subject: dto.subject ?? null },
    });
  }

  async updatePreference(recipientId: string, dto: UpdatePreferenceDto) {
    return this.prisma.notificationPreference.upsert({
      where: {
        recipientId_channel_template: {
          recipientId,
          channel: dto.channel,
          template: dto.template ?? '',
        },
      },
      create: {
        recipientId,
        channel: dto.channel,
        template: dto.template,
        enabled: dto.enabled,
      },
      update: { enabled: dto.enabled },
    });
  }

  /** The in-app notification centre. */
  async inbox(recipientId: string, query: ListNotificationsQuery) {
    const where = {
      recipientId,
      channel: query.channel ?? NotificationChannel.IN_APP,
      status: { not: 'SUPPRESSED' as const },
      ...(query.unreadOnly ? { readAt: null } : {}),
    };

    const [items, totalItems, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { queuedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { recipientId, channel: NotificationChannel.IN_APP, readAt: null },
      }),
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
        unread,
      },
    };
  }

  async markRead(notificationId: string, recipientId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification) throw DomainError.notFound('Notification', notificationId);
    if (notification.recipientId !== recipientId) {
      // NOT_FOUND rather than FORBIDDEN: a 403 would confirm the id exists.
      throw DomainError.notFound('Notification', notificationId);
    }
    if (notification.readAt) return notification;

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: this.clock.now() },
    });
  }

  async markAllRead(recipientId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { recipientId, channel: NotificationChannel.IN_APP, readAt: null },
      data: { readAt: this.clock.now() },
    });
    return { marked: result.count };
  }
}
