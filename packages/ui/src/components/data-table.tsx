import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { EmptyState } from './empty-state';
import { TableSkeleton } from './skeleton';

export interface Column<TRow> {
  readonly key: string;
  readonly header: ReactNode;
  readonly render: (row: TRow) => ReactNode;
  /** Right-aligns and tabular-numbers the cell — use for money and counts. */
  readonly numeric?: boolean;
  readonly className?: string;
  /** Hides the column below the `sm` breakpoint. */
  readonly hideOnMobile?: boolean;
}

export interface DataTableProps<TRow> {
  readonly columns: ReadonlyArray<Column<TRow>>;
  readonly rows: readonly TRow[];
  readonly rowKey: (row: TRow) => string;
  readonly loading?: boolean;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
  readonly emptyAction?: ReactNode;
  readonly onRowClick?: (row: TRow) => void;
  readonly caption?: string;
  readonly className?: string;
}

/**
 * A table that handles its own loading and empty states.
 *
 * Every list screen needs all three states, and building them per screen is how
 * a console ends up with "No results." in one place and a blank rectangle in
 * another. The table scrolls inside its own container so a wide column set never
 * makes the whole page scroll sideways.
 */
export function DataTable<TRow>({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyTitle = 'Nothing to show',
  emptyDescription = 'There are no records matching the current filters.',
  emptyAction,
  onRowClick,
  caption,
  className,
}: DataTableProps<TRow>) {
  if (loading) return <TableSkeleton columns={columns.length} />;

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full min-w-[40rem] text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-line text-ink-400 border-b text-left text-xs uppercase tracking-wider">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'px-4 py-2.5 font-medium',
                  column.numeric && 'text-right',
                  column.hideOnMobile && 'hidden sm:table-cell',
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'border-line border-b last:border-0',
                onRowClick && 'hover:bg-canvas cursor-pointer',
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    'text-ink-700 px-4 py-2.5',
                    column.numeric && 'text-right tabular-nums',
                    column.hideOnMobile && 'hidden sm:table-cell',
                    column.className,
                  )}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
