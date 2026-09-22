import { Controller, Get, Header, Injectable, VERSION_NEUTRAL } from '@nestjs/common';
import { Public } from '../security/guards.js';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * One Prometheus registry per process. Metric names follow the OpenMetrics
 * convention (`<namespace>_<subject>_<unit>`) so Grafana dashboards written for
 * one service work unchanged against every other.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpRequests = new Counter({
    name: 'staysphere_http_requests_total',
    help: 'Total HTTP requests handled, labelled by route and outcome.',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [this.registry],
  });

  readonly httpDuration = new Histogram({
    name: 'staysphere_http_request_duration_seconds',
    help: 'HTTP request latency in seconds.',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  readonly eventsPublished = new Counter({
    name: 'staysphere_events_published_total',
    help: 'Domain events published to the broker.',
    labelNames: ['topic', 'type', 'outcome'] as const,
    registers: [this.registry],
  });

  readonly eventsConsumed = new Counter({
    name: 'staysphere_events_consumed_total',
    help: 'Domain events consumed, including duplicates suppressed by idempotency.',
    labelNames: ['topic', 'type', 'outcome'] as const,
    registers: [this.registry],
  });

  readonly businessEvents = new Counter({
    name: 'staysphere_business_events_total',
    help: 'Business-meaningful occurrences such as bookings confirmed or check-ins completed.',
    labelNames: ['event', 'hotel_id'] as const,
    registers: [this.registry],
  });

  constructor(serviceName: string, serviceVersion: string) {
    this.registry.setDefaultLabels({ service: serviceName, version: serviceVersion });
    collectDefaultMetrics({ register: this.registry, prefix: 'staysphere_' });
  }

  async scrape(): Promise<string> {
    return this.registry.metrics();
  }
}

/** Exposes the registry on `/metrics` for the Prometheus scraper. */
export function createMetricsController(metrics: MetricsService): new () => object {
  // Version-neutral and public for the same reason as the health probes: the
  // Prometheus scrape config targets /metrics and carries no credentials.
  @Controller({ version: VERSION_NEUTRAL })
  @Public()
  class MetricsController {
    @Get('metrics')
    @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
    scrape(): Promise<string> {
      return metrics.scrape();
    }
  }
  return MetricsController;
}
