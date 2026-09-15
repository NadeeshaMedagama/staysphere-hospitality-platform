import { Module } from '@nestjs/common';
import { loadFinanceEnv, type FinanceEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FinanceController } from './finance.controller.js';
import { CLOCK, FINANCE_ENV, FinanceService, type Clock } from './finance.service.js';

const systemClock: Clock = { now: () => new Date() };

@Module({
  controllers: [FinanceController],
  providers: [
    PrismaService,
    FinanceService,
    { provide: FINANCE_ENV, useFactory: (): FinanceEnv => loadFinanceEnv() },
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [FinanceService, PrismaService],
})
export class FinanceModule {}
