import { cn } from '../lib/cn';

export interface SkeletonProps {
  readonly className?: string;
}

/**
 * A loading placeholder shaped like the content it replaces.
 *
 * `aria-hidden` with a live-region label elsewhere: a screen reader announcing
 * a dozen shimmering rectangles is noise, not information.
 */
export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden="true" className={cn('bg-line animate-pulse rounded', className)} />;
}

export function TableSkeleton({ columns = 4, rows = 5 }: { columns?: number; rows?: number }) {
  return (
    <div className="p-4" role="status" aria-label="Loading">
      <span className="sr-only">Loading…</span>
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div key={rowIndex} className="flex gap-4">
            {Array.from({ length: columns }, (_, columnIndex) => (
              <Skeleton
                key={columnIndex}
                className={cn('h-4 flex-1', columnIndex === 0 && 'max-w-[8rem]')}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div
      className="rounded-card border-line bg-surface border p-4"
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-28" />
      <Skeleton className="mt-2 h-3 w-32" />
    </div>
  );
}
