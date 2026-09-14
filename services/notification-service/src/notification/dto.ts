import { NotificationChannel, TemplateKey } from '@staysphere/contracts';
import { z } from 'zod';

export const sendNotificationSchema = z.object({
  recipientId: z.string().min(1),
  toAddress: z.string().trim().min(3).max(320),
  template: z.nativeEnum(TemplateKey),
  locale: z.string().trim().min(2).max(10).default('en'),
  channels: z.array(z.nativeEnum(NotificationChannel)).min(1),
  values: z.record(z.string(), z.unknown()).default({}),
  hotelId: z.string().optional(),
  /** Ties the message to the event that caused it, for de-duplication. */
  eventId: z.string().min(1),
});
export type SendNotificationDto = z.infer<typeof sendNotificationSchema>;

export const upsertTemplateSchema = z.object({
  key: z.nativeEnum(TemplateKey),
  channel: z.nativeEnum(NotificationChannel),
  locale: z.string().trim().min(2).max(10).default('en'),
  subject: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1).max(20_000),
  required: z.array(z.string().trim().min(1).max(60)).default([]),
});
export type UpsertTemplateDto = z.infer<typeof upsertTemplateSchema>;

export const updatePreferenceSchema = z.object({
  channel: z.nativeEnum(NotificationChannel),
  template: z.nativeEnum(TemplateKey).nullable().default(null),
  enabled: z.boolean(),
});
export type UpdatePreferenceDto = z.infer<typeof updatePreferenceSchema>;

export const listNotificationsQuerySchema = z.object({
  unreadOnly: z.coerce.boolean().default(false),
  channel: z.nativeEnum(NotificationChannel).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
