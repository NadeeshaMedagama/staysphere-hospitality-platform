import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly className?: string;
}

/**
 * An empty state that explains itself.
 *
 * "No bookings." tells someone nothing. "Reservations will appear here once a
 * guest books" tells them the screen is working and what to expect — which is
 * the difference between a confident user and a support ticket.
 */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-card border-line-strong bg-surface border border-dashed px-6 py-14 text-center',
        className,
      )}
    >
      <h3 className="text-ink-900 text-base font-semibold">{title}</h3>
      {description ? (
        <p className="text-ink-500 mx-auto mt-2 max-w-sm text-sm leading-relaxed">{description}</p>
      ) : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

export interface ErrorStateProps {
  readonly title?: string;
  readonly description?: string;
  readonly requestId?: string;
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
  readonly className?: string;
}

/**
 * A failure the user can act on.
 *
 * The request id is shown deliberately: it is the one piece of information that
 * lets support trace the failure across every service, and asking a user to
 * "describe what happened" instead wastes everyone's time.
 */
export function ErrorState({
  title = 'Something went wrong',
  description = 'The request could not be completed. Try again, or contact support if it keeps happening.',
  requestId,
  onRetry,
  retryLabel = 'Try again',
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-card border-negative/30 bg-negative-soft border px-6 py-10 text-center',
        className,
      )}
    >
      <h3 className="text-ink-900 text-base font-semibold">{title}</h3>
      <p className="text-ink-700 mx-auto mt-2 max-w-sm text-sm leading-relaxed">{description}</p>
      {requestId ? (
        <p className="text-ink-500 mt-3 font-mono text-xs">Reference: {requestId}</p>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-control border-line-strong bg-surface text-ink-900 hover:bg-canvas mt-6 border px-4 py-2 text-sm font-medium"
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
