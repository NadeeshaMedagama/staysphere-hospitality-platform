import { Module } from '@nestjs/common';
import { loadHotelEnv, type HotelEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { HotelController } from './hotel.controller.js';
import { CLOCK, HOTEL_ENV, HotelService, type Clock } from './hotel.service.js';

const systemClock: Clock = { now: () => new Date() };

@Module({
  controllers: [HotelController],
  providers: [
    PrismaService,
    HotelService,
    { provide: HOTEL_ENV, useFactory: (): HotelEnv => loadHotelEnv() },
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [HotelService, PrismaService],
})
export class HotelModule {}
