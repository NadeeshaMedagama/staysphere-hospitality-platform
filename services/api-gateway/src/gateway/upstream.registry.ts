import { Injectable } from '@nestjs/common';
import { CircuitBreaker } from '@staysphere/service-core';
import type { GatewayEnv } from '../config/env.js';

/**
 * Maps logical upstream names to URLs and owns one circuit breaker per upstream.
 *
 * Breakers are per-service, not global: a failing reporting service must not
 * stop guests from booking rooms.
 */
@Injectable()
export class UpstreamRegistry {
  private readonly urls: Readonly<Record<string, string | undefined>>;
  private readonly breakers = new Map<string, CircuitBreaker>();

  constructor(private readonly env: GatewayEnv) {
    this.urls = {
      auth: env.AUTH_SERVICE_URL,
      booking: env.BOOKING_SERVICE_URL,
      hotel: env.HOTEL_SERVICE_URL,
      room: env.ROOM_SERVICE_URL,
      pricing: env.PRICING_SERVICE_URL,
      payment: env.PAYMENT_SERVICE_URL,
      stay: env.STAY_SERVICE_URL,
      finance: env.FINANCE_SERVICE_URL,
      housekeeping: env.HOUSEKEEPING_SERVICE_URL,
      maintenance: env.MAINTENANCE_SERVICE_URL,
      notification: env.NOTIFICATION_SERVICE_URL,
      review: env.REVIEW_SERVICE_URL,
      reporting: env.REPORTING_SERVICE_URL,
      audit: env.AUDIT_SERVICE_URL,
    };
  }

  get registry(): Readonly<Record<string, string | undefined>> {
    return this.urls;
  }

  /** Upstreams that are actually configured in this environment. */
  get configured(): Array<{ name: string; url: string }> {
    return Object.entries(this.urls)
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
      .map(([name, url]) => ({ name, url }));
  }

  breakerFor(upstream: string): CircuitBreaker {
    let breaker = this.breakers.get(upstream);
    if (!breaker) {
      breaker = new CircuitBreaker({
        name: upstream,
        failureThreshold: this.env.CIRCUIT_FAILURE_THRESHOLD,
        resetTimeoutMs: this.env.CIRCUIT_RESET_MS,
      });
      this.breakers.set(upstream, breaker);
    }
    return breaker;
  }

  /** Breaker states, surfaced on the gateway's own status endpoint. */
  states(): Record<string, string> {
    return Object.fromEntries(
      [...this.breakers.entries()].map(([name, breaker]) => [name, breaker.currentState]),
    );
  }
}
