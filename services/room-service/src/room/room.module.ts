import { Module } from '@nestjs/common';
import { loadRoomEnv, type RoomEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RoomController } from './room.controller.js';
import { CLOCK, ROOM_ENV, RoomService, type Clock } from './room.service.js';

const systemClock: Clock = { now: () => new Date() };

@Module({
  controllers: [RoomController],
  providers: [
    PrismaService,
    RoomService,
    { provide: ROOM_ENV, useFactory: (): RoomEnv => loadRoomEnv() },
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [RoomService, PrismaService],
})
export class RoomModule {}
