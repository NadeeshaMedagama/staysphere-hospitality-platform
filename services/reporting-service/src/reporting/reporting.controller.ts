import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DomainError, Permission } from '@staysphere/contracts';
import { RequirePermissions, zodBody } from '@staysphere/service-core';
import {
  periodQuerySchema,
  recordDailySchema,
  trendQuerySchema,
  type RecordDailyDto,
} from './dto.js';
import { ReportingService } from './reporting.service.js';

@ApiTags('Reports')
@Controller({ path: 'reports', version: '1' })
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Get('today')
  @RequirePermissions(Permission.REPORT_READ)
  @ApiOperation({ summary: 'Today’s operational snapshot for the overview cards.' })
  today(@Query('hotelId') hotelId: string) {
    if (!hotelId) throw DomainError.validation('hotelId is required.');
    return this.reporting.today(hotelId);
  }

  @Get('performance')
  @RequirePermissions(Permission.REPORT_READ)
  @ApiOperation({
    summary: 'Occupancy, ADR, RevPAR and TRevPAR, optionally against the preceding period.',
  })
  performance(@Query() query: Record<string, string>) {
    return this.reporting.performance(periodQuerySchema.parse(query));
  }

  @Get('trend')
  @RequirePermissions(Permission.REPORT_READ)
  @ApiOperation({ summary: 'A KPI time series for the dashboard charts.' })
  trend(@Query() query: Record<string, string>) {
    return this.reporting.trend(trendQuerySchema.parse(query));
  }

  @Get('channels')
  @RequirePermissions(Permission.REPORT_READ)
  @ApiOperation({ summary: 'Booking mix by channel, with revenue share and lead time.' })
  channels(@Query() query: Record<string, string>) {
    return this.reporting.channelMix(periodQuerySchema.parse(query));
  }

  @Get('housekeeping')
  @RequirePermissions(Permission.REPORT_READ)
  @ApiOperation({ summary: 'Housekeeping throughput and rework rate per person.' })
  housekeeping(@Query() query: Record<string, string>) {
    return this.reporting.housekeepingPerformance(periodQuerySchema.parse(query));
  }

  @Post('daily')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  @ApiOperation({
    summary: 'Record or replay a night’s performance. Normally driven by event projection.',
  })
  recordDaily(@Body(zodBody(recordDailySchema)) dto: RecordDailyDto) {
    return this.reporting.recordDaily(dto);
  }
}
