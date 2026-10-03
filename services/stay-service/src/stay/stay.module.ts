import { Module } from '@nestjs/common';
import { loadStayEnv, type StayEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CLOCK, STAY_ENV, StayService, type Clock } from './stay.service.js';
import { StayController } from './stay.controller.js';

const systemClock: Clock = { now: () => new Date() };

@Module({
  controllers: [StayController],
  providers: [
    PrismaService,
    StayService,
    { provide: STAY_ENV, useFactory: (): StayEnv => loadStayEnv() },
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [StayService, PrismaService],
})
export class StayModule {}
