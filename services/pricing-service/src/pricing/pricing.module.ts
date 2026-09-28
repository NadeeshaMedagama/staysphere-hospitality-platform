import { Module } from '@nestjs/common';
import { loadPricingEnv, type PricingEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PricingController } from './pricing.controller.js';
import { CLOCK, PRICING_ENV, PricingService, type Clock } from './pricing.service.js';

const systemClock: Clock = { now: () => new Date() };

@Module({
  controllers: [PricingController],
  providers: [
    PrismaService,
    PricingService,
    { provide: PRICING_ENV, useFactory: (): PricingEnv => loadPricingEnv() },
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [PricingService, PrismaService],
})
export class PricingModule {}
