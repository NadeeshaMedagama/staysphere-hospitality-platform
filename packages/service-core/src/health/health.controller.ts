import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { Public } from '../security/guards.js';

export interface DependencyProbe {
  readonly name: string;
  check(): Promise<void>;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  uptimeSeconds: number;
  checks: Record<string, { status: 'up' | 'down'; error?: string }>;
}

export interface HealthOptions {
  serviceName: string;
  serviceVersion: string;
  /** Probes consulted by /ready. Keep these cheap — Kubernetes calls them often. */
  probes?: readonly DependencyProbe[];
  /** Injected for testability; defaults to process uptime. */
  uptimeSeconds?: () => number;
}

/**
 * Liveness and readiness endpoints.
 *
 * `/health` answers "is the process alive?" and must never touch a dependency —
 * a database outage should not cause Kubernetes to kill otherwise-healthy pods.
 * `/ready` answers "should traffic be routed here?" and does check dependencies.
 */
export function createHealthController(options: HealthOptions): new () => object {
  const uptime = options.uptimeSeconds ?? (() => Math.floor(process.uptime()));
  const probes = options.probes ?? [];

  // VERSION_NEUTRAL keeps these at /health and /ready rather than /v1/health:
  // a Kubernetes probe and a Prometheus scrape config must not have to change
  // when the API version bumps.
  //
  // @Public() is equally load-bearing. AuthorizationGuard is registered
  // globally and fails closed, so without it a probe gets 401 and the kubelet
  // restarts a pod that is perfectly healthy.
  @Controller({ version: VERSION_NEUTRAL })
  @Public()
  class HealthController {
    @Get('health')
    live(): Pick<HealthReport, 'status' | 'service' | 'version' | 'uptimeSeconds'> {
      return {
        status: 'ok',
        service: options.serviceName,
        version: options.serviceVersion,
        uptimeSeconds: uptime(),
      };
    }

    @Get('ready')
    async ready(): Promise<HealthReport> {
      const checks: HealthReport['checks'] = {};
      const results = await Promise.allSettled(probes.map((probe) => probe.check()));

      results.forEach((result, index) => {
        const probe = probes[index];
        if (!probe) return;
        checks[probe.name] =
          result.status === 'fulfilled'
            ? { status: 'up' }
            : { status: 'down', error: toMessage(result.reason) };
      });

      const healthy = Object.values(checks).every((check) => check.status === 'up');
      return {
        status: healthy ? 'ok' : 'degraded',
        service: options.serviceName,
        version: options.serviceVersion,
        uptimeSeconds: uptime(),
        checks,
      };
    }
  }

  return HealthController;
}

function toMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  return String(reason);
}
