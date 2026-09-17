import { Module } from '@nestjs/common';
import { loadHousekeepingEnv, type HousekeepingEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { HousekeepingController } from './housekeeping.controller.js';
import {
  CLOCK,
  HOUSEKEEPING_ENV,
  HousekeepingService,
  type Clock,
} from './housekeeping.service.js';

const systemClock: Clock = { now: () => new Date() };

@Module({
  controllers: [HousekeepingController],
  providers: [
    PrismaService,
    HousekeepingService,
    { provide: HOUSEKEEPING_ENV, useFactory: (): HousekeepingEnv => loadHousekeepingEnv() },
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [HousekeepingService, PrismaService],
})
export class HousekeepingModule {}
