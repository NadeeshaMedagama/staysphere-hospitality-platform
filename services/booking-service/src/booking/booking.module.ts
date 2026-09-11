import { Module } from '@nestjs/common';
import { loadBookingEnv, type BookingEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BookingController } from './booking.controller.js';
import { BOOKING_ENV, BookingService, CLOCK, type Clock } from './booking.service.js';

const systemClock: Clock = { now: () => new Date() };

@Module({
  controllers: [BookingController],
  providers: [
    PrismaService,
    BookingService,
    { provide: BOOKING_ENV, useFactory: (): BookingEnv => loadBookingEnv() },
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [BookingService, PrismaService],
})
export class BookingModule {}
