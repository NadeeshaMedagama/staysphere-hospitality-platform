import { cn } from '../lib/cn';

export interface StatDelta {
  readonly value: string;
  readonly direction: 'up' | 'down' | 'flat';
}

export interface StatCardProps {
  readonly label: string;
  readonly value: string;
  readonly delta?: StatDelta;
  readonly caption?: string;
  /**
   * True when a rise is bad — cancellations, overdue tickets, rework rate.
   * Without this a growing problem renders in the same green as growing revenue.
   */
  readonly invertDelta?: boolean;
  readonly className?: string;
}

export function StatCard({
  label,
  value,
  delta,
  caption,
  invertDelta = false,
  className,
}: StatCardProps) {
  const good =
    delta && delta.direction !== 'flat' ? (delta.direction === 'up') !== invertDelta : null;

  return (
    <div className={cn('rounded-card border-line bg-surface border p-4', className)}>
      <p className="text-ink-400 text-xs font-medium uppercase tracking-wider">{label}</p>
      <p className="text-ink-900 mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {delta || caption ? (
        <div className="mt-1.5 flex items-center gap-2 text-xs">
          {delta ? (
            <span
              className={cn(
                'font-medium tabular-nums',
                good === null && 'text-ink-500',
                good === true && 'text-positive',
                good === false && 'text-negative',
              )}
            >
              <span aria-hidden="true">
                {delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : '—'}
              </span>{' '}
              <span className="sr-only">
                {delta.direction === 'up'
                  ? 'up'
                  : delta.direction === 'down'
                    ? 'down'
                    : 'unchanged'}
              </span>
              {delta.value}
            </span>
          ) : null}
          {caption ? <span className="text-ink-400">{caption}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
