import { Module } from '@nestjs/common';
import { loadMaintenanceEnv, type MaintenanceEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MaintenanceController } from './maintenance.controller.js';
import { CLOCK, MAINTENANCE_ENV, MaintenanceService, type Clock } from './maintenance.service.js';

const systemClock: Clock = { now: () => new Date() };

@Module({
  controllers: [MaintenanceController],
  providers: [
    PrismaService,
    MaintenanceService,
    { provide: MAINTENANCE_ENV, useFactory: (): MaintenanceEnv => loadMaintenanceEnv() },
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [MaintenanceService, PrismaService],
})
export class MaintenanceModule {}
