import { Module } from '@nestjs/common';
import { loadAuditEnv, type AuditEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditController } from './audit.controller.js';
import { AUDIT_ENV, AuditService, CLOCK, type Clock } from './audit.service.js';

const systemClock: Clock = { now: () => new Date() };

@Module({
  controllers: [AuditController],
  providers: [
    PrismaService,
    AuditService,
    { provide: AUDIT_ENV, useFactory: (): AuditEnv => loadAuditEnv() },
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [AuditService, PrismaService],
})
export class AuditModule {}
