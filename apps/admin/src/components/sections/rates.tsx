import { DataTable, type Column } from '@staysphere/ui';
import { roomTypes, type RoomType, type Scope } from '@/lib/data';
import { SectionFailure } from '@/components/section-state';

const COLUMNS: ReadonlyArray<Column<RoomType>> = [
  { key: 'code', header: 'Code', render: (row) => <span className="font-mono text-xs">{row.code}</span> },
  { key: 'name', header: 'Room type', render: (row) => row.name },
  { key: 'occupancy', header: 'Sleeps', numeric: true, render: (row) => row.maxOccupancy },
  {
    key: 'split',
    header: 'Adults / children',
    numeric: true,
    hideOnMobile: true,
    render: (row) => `${row.maxAdults} / ${row.maxChildren}`,
  },
  {
    key: 'size',
    header: 'Size',
    numeric: true,
    hideOnMobile: true,
    render: (row) => (row.sizeSquareMetres ? `${row.sizeSquareMetres} m²` : '—'),
  },
  { key: 'active', header: 'Sellable', render: (row) => (row.active ? 'Yes' : 'No') },
];

/**
 * Rate plans are addressed per room type — `/rates/plans/:hotelId/:roomTypeId` —
 * and the pricing service has no endpoint that lists them all. The inventory
 * they attach to is listed instead, which is the part that can be read today.
 */
export async function RatesSection({ scope }: { scope: Scope }) {
  const result = await roomTypes(scope);
  if (!result.ok) return <SectionFailure failure={result} service="The room service" />;

  return (
    <div className="space-y-5">
      <div className="rounded-card border-line border bg-white">
        <header className="border-line border-b px-4 py-3">
          <h2 className="text-ink-900 text-sm font-semibold">Sellable inventory</h2>
        </header>
        <DataTable
          columns={COLUMNS}
          rows={result.data}
          rowKey={(row) => row.id}
          caption="Room types"
          emptyTitle="No room types configured"
          emptyDescription="Rate plans attach to a room type, so one has to exist first."
        />
      </div>

      <div className="rounded-card border-line border border-dashed bg-white p-6">
        <h2 className="text-ink-900 text-sm font-semibold">Rate plans</h2>
        <p className="text-ink-500 mt-2 max-w-xl text-sm leading-relaxed">
          The pricing service reads a plan one room type at a time and has no endpoint that lists
          every plan for a property, so a rate calendar cannot be assembled here yet.
        </p>
        <p className="text-ink-400 mt-3 max-w-xl font-mono text-xs">
          Available: GET /api/v1/rates/plans/:hotelId/:roomTypeId · GET /api/v1/rates/quote
        </p>
      </div>
    </div>
  );
}
