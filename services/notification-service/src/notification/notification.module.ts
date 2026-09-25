import { Module } from '@nestjs/common';
import { loadNotificationEnv, type NotificationEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationController } from './notification.controller.js';
import {
  CLOCK,
  NOTIFICATION_ENV,
  NotificationService,
  type Clock,
} from './notification.service.js';

const systemClock: Clock = { now: () => new Date() };

@Module({
  controllers: [NotificationController],
  providers: [
    PrismaService,
    NotificationService,
    { provide: NOTIFICATION_ENV, useFactory: (): NotificationEnv => loadNotificationEnv() },
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [NotificationService, PrismaService],
})
export class NotificationModule {}
