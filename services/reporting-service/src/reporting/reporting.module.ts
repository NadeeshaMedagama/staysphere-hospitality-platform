import { Module } from '@nestjs/common';
import { loadReportingEnv, type ReportingEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReportingController } from './reporting.controller.js';
import { CLOCK, REPORTING_ENV, ReportingService, type Clock } from './reporting.service.js';

const systemClock: Clock = { now: () => new Date() };

@Module({
  controllers: [ReportingController],
  providers: [
    PrismaService,
    ReportingService,
    { provide: REPORTING_ENV, useFactory: (): ReportingEnv => loadReportingEnv() },
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [ReportingService, PrismaService],
})
export class ReportingModule {}
