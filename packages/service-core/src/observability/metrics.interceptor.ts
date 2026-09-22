import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { tap, type Observable } from 'rxjs';
import { MetricsService } from './metrics.js';

/**
 * Records latency and outcome for every HTTP request.
 *
 * The *route pattern* is used as the label rather than the resolved URL —
 * labelling by `/bookings/bkg_01H...` would create unbounded cardinality and
 * eventually take Prometheus down.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<{ method?: string; route?: { path?: string }; url?: string }>();
    const response = http.getResponse<{ statusCode?: number }>();

    const method = request.method ?? 'UNKNOWN';
    const route = request.route?.path ?? 'unmatched';
    const stopTimer = this.metrics.httpDuration.startTimer({ method, route });

    const record = (status: number): void => {
      const labels = { method, route, status: String(status) };
      stopTimer({ status: String(status) });
      this.metrics.httpRequests.inc(labels);
    };

    return next.handle().pipe(
      tap({
        next: () => record(response.statusCode ?? 200),
        error: (error: { status?: number }) => record(error?.status ?? 500),
      }),
    );
  }
}
