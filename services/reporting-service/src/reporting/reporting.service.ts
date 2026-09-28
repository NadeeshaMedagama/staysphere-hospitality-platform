import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ReportingEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { PeriodQuery, RecordDailyDto, TrendQuery } from './dto.js';
import { computeKpis, compareKpis, occupancyFor, type DailyPerformance } from './kpi.js';

export const REPORTING_ENV = Symbol('REPORTING_ENV');
export const CLOCK = Symbol('CLOCK');

export interface Clock {
  now(): Date;
}

const MS_PER_DAY = 86_400_000;

@Injectable()
export class ReportingService {
  private readonly logger = new Logger(ReportingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REPORTING_ENV) private readonly env: ReportingEnv,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Records a night's performance.
   *
   * Upsert rather than insert: the projection is rebuilt by replaying events, so
   * the same night is written many times and must converge on one row.
   */
  async recordDaily(dto: RecordDailyDto) {
    return this.prisma.dailyPerformance.upsert({
      where: { hotelId_date: { hotelId: dto.hotelId, date: dto.date } },
      create: dto,
      update: dto,
    });
  }

  /** Headline KPIs for a period, optionally against the preceding one. */
  async performance(query: PeriodQuery) {
    const days = await this.loadDays(query.hotelId, query.from, query.to);
    const currency = days[0]?.currency ?? 'USD';
    const current = computeKpis(days, currency);

    if (!query.compare) return { period: { from: query.from, to: query.to }, current };

    // The comparison window is the same length, immediately before.
    const lengthMs = query.to.getTime() - query.from.getTime() + MS_PER_DAY;
    const previousTo = new Date(query.from.getTime() - MS_PER_DAY);
    const previousFrom = new Date(previousTo.getTime() - lengthMs + MS_PER_DAY);

    const previousDays = await this.loadDays(query.hotelId, previousFrom, previousTo);
    const previous = computeKpis(previousDays, currency);

    return {
      period: { from: query.from, to: query.to },
      comparisonPeriod: { from: previousFrom, to: previousTo },
      ...compareKpis(current, previous),
    };
  }

  /** A time series for the dashboard charts. */
  async trend(query: TrendQuery) {
    const days = await this.loadDays(query.hotelId, query.from, query.to);
    const currency = days[0]?.currency ?? 'USD';

    const buckets = new Map<string, DailyPerformance[]>();
    for (const day of days) {
      const key = bucketKey(day.date, query.granularity);
      const bucket = buckets.get(key) ?? [];
      bucket.push(day);
      buckets.set(key, bucket);
    }

    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, bucket]) => {
        const kpis = computeKpis(bucket, currency);
        return {
          period,
          occupancyPct: kpis.occupancyPct,
          adrMinor: kpis.adr.amountMinor,
          revparMinor: kpis.revpar.amountMinor,
          roomRevenueMinor: kpis.roomRevenue.amountMinor,
          totalRevenueMinor: kpis.totalRevenue.amountMinor,
          roomsSold: kpis.roomsSold,
          currency,
        };
      });
  }

  /** Today's operational snapshot for the console's overview cards. */
  async today(hotelId: string) {
    const today = startOfUtcDay(this.clock.now());
    const row = await this.prisma.dailyPerformance.findUnique({
      where: { hotelId_date: { hotelId, date: today } },
    });

    if (!row) {
      return {
        date: today,
        occupancyPct: 0,
        roomsSold: 0,
        roomsAvailable: 0,
        arrivals: 0,
        departures: 0,
        cancellations: 0,
        revenueMinor: 0,
        currency: 'USD',
      };
    }

    return {
      date: row.date,
      occupancyPct: occupancyFor(row.roomsSold, row.roomsAvailable),
      roomsSold: row.roomsSold,
      roomsAvailable: row.roomsAvailable,
      arrivals: row.arrivals,
      departures: row.departures,
      cancellations: row.cancellations,
      revenueMinor: row.roomRevenueMinor + row.serviceRevenueMinor,
      currency: row.currency,
    };
  }

  /** Booking mix by channel — where the business actually comes from. */
  async channelMix(query: PeriodQuery) {
    const facts = await this.prisma.bookingFact.findMany({
      where: {
        hotelId: query.hotelId,
        createdOn: { gte: query.from, lte: query.to },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
      select: { channel: true, totalMinor: true, nights: true, leadTimeDays: true, currency: true },
    });

    const byChannel = new Map<
      string,
      { bookings: number; revenueMinor: number; nights: number; leadTimeTotal: number }
    >();

    for (const fact of facts) {
      const entry = byChannel.get(fact.channel) ?? {
        bookings: 0,
        revenueMinor: 0,
        nights: 0,
        leadTimeTotal: 0,
      };
      entry.bookings += 1;
      entry.revenueMinor += fact.totalMinor;
      entry.nights += fact.nights;
      entry.leadTimeTotal += fact.leadTimeDays;
      byChannel.set(fact.channel, entry);
    }

    const totalRevenue = [...byChannel.values()].reduce((sum, e) => sum + e.revenueMinor, 0);

    return [...byChannel.entries()]
      .map(([channel, entry]) => ({
        channel,
        bookings: entry.bookings,
        revenueMinor: entry.revenueMinor,
        revenueSharePct:
          totalRevenue === 0 ? 0 : Math.round((entry.revenueMinor / totalRevenue) * 1000) / 10,
        averageNights: Math.round((entry.nights / entry.bookings) * 10) / 10,
        averageLeadTimeDays: Math.round(entry.leadTimeTotal / entry.bookings),
        currency: facts[0]?.currency ?? 'USD',
      }))
      .sort((a, b) => b.revenueMinor - a.revenueMinor);
  }

  /** Housekeeping throughput per person, for staffing decisions. */
  async housekeepingPerformance(query: PeriodQuery) {
    const facts = await this.prisma.housekeepingFact.findMany({
      where: { hotelId: query.hotelId, date: { gte: query.from, lte: query.to } },
    });

    const byStaff = new Map<string, { tasks: number; minutes: number; rework: number }>();
    for (const fact of facts) {
      const entry = byStaff.get(fact.staffId) ?? { tasks: 0, minutes: 0, rework: 0 };
      entry.tasks += fact.tasksCompleted;
      entry.minutes += fact.minutesWorked;
      entry.rework += fact.reworkCount;
      byStaff.set(fact.staffId, entry);
    }

    return [...byStaff.entries()]
      .map(([staffId, entry]) => ({
        staffId,
        tasksCompleted: entry.tasks,
        minutesWorked: entry.minutes,
        averageMinutesPerTask:
          entry.tasks === 0 ? 0 : Math.round((entry.minutes / entry.tasks) * 10) / 10,
        // The quality signal that stops this becoming a pure speed contest.
        reworkRatePct: entry.tasks === 0 ? 0 : Math.round((entry.rework / entry.tasks) * 1000) / 10,
      }))
      .sort((a, b) => b.tasksCompleted - a.tasksCompleted);
  }

  private async loadDays(hotelId: string, from: Date, to: Date): Promise<DailyPerformance[]> {
    const rows = await this.prisma.dailyPerformance.findMany({
      where: { hotelId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    });
    return rows.map((row) => ({
      date: row.date,
      roomsAvailable: row.roomsAvailable,
      roomsSold: row.roomsSold,
      roomRevenueMinor: row.roomRevenueMinor,
      serviceRevenueMinor: row.serviceRevenueMinor,
      currency: row.currency,
    }));
  }
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function bucketKey(date: Date, granularity: 'day' | 'week' | 'month'): string {
  const iso = date.toISOString().slice(0, 10);
  if (granularity === 'day') return iso;
  if (granularity === 'month') return iso.slice(0, 7);

  // ISO week: Monday-anchored, so a week never straddles two labels.
  const monday = new Date(date);
  const offset = (monday.getUTCDay() + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - offset);
  return monday.toISOString().slice(0, 10);
}
