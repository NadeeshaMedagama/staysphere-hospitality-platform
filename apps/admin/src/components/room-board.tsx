import { RoomStatus } from '@staysphere/contracts';
import { cn } from '@staysphere/ui';

export interface BoardRoom {
  readonly number: string;
  readonly status: RoomStatus;
  readonly note?: string;
}

const STATUS_STYLE: Record<RoomStatus, { chip: string; dot: string; label: string }> = {
  [RoomStatus.AVAILABLE]: {
    chip: 'border-status-available/30 bg-status-available/8 text-status-available',
    dot: 'bg-status-available',
    label: 'Available',
  },
  [RoomStatus.OCCUPIED]: {
    chip: 'border-status-occupied/30 bg-status-occupied/8 text-status-occupied',
    dot: 'bg-status-occupied',
    label: 'Occupied',
  },
  [RoomStatus.RESERVED]: {
    chip: 'border-status-reserved/30 bg-status-reserved/8 text-status-reserved',
    dot: 'bg-status-reserved',
    label: 'Reserved',
  },
  [RoomStatus.CLEANING]: {
    chip: 'border-status-cleaning/30 bg-status-cleaning/8 text-status-cleaning',
    dot: 'bg-status-cleaning',
    label: 'Cleaning',
  },
  [RoomStatus.MAINTENANCE]: {
    chip: 'border-status-maintenance/30 bg-status-maintenance/8 text-status-maintenance',
    dot: 'bg-status-maintenance',
    label: 'Maintenance',
  },
  [RoomStatus.OUT_OF_SERVICE]: {
    chip: 'border-status-offline/30 bg-status-offline/8 text-status-offline',
    dot: 'bg-status-offline',
    label: 'Out of service',
  },
};

/**
 * The live floor board.
 *
 * Status is conveyed by a written label as well as colour, so it stays readable
 * for colour-blind staff and in the washed-out light of a front-desk monitor.
 * In production this subscribes to `inventory.room-status-changed` over the
 * WebSocket gateway and updates without a refresh.
 */
export function RoomBoard({
  floors,
}: {
  floors: ReadonlyArray<{ floor: number; rooms: readonly BoardRoom[] }>;
}) {
  return (
    <section
      aria-labelledby="room-board-heading"
      className="rounded-card border-line border bg-white"
    >
      <header className="border-line flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <h2 id="room-board-heading" className="text-ink-900 text-sm font-semibold">
          Room board
        </h2>
        <ul className="flex flex-wrap gap-3">
          {Object.values(RoomStatus).map((status) => (
            <li key={status} className="text-ink-500 flex items-center gap-1.5 text-[0.6875rem]">
              <span className={cn('size-2 rounded-full', STATUS_STYLE[status].dot)} aria-hidden />
              {STATUS_STYLE[status].label}
            </li>
          ))}
        </ul>
      </header>

      <div className="space-y-5 p-4">
        {floors.map(({ floor, rooms }) => (
          <div key={floor}>
            <h3 className="text-ink-400 mb-2 text-xs font-medium uppercase tracking-wider">
              Floor {floor}
            </h3>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {rooms.map((room) => {
                const style = STATUS_STYLE[room.status];
                return (
                  <li key={room.number}>
                    <button
                      type="button"
                      className={cn(
                        'w-full rounded-lg border p-2.5 text-left transition-shadow hover:shadow-sm',
                        style.chip,
                      )}
                      aria-label={`Room ${room.number}, ${style.label}${room.note ? `, ${room.note}` : ''}`}
                    >
                      <span className="text-ink-900 block text-sm font-semibold tabular-nums">
                        {room.number}
                      </span>
                      <span className="mt-0.5 block text-[0.6875rem] font-medium">
                        {style.label}
                      </span>
                      {room.note ? (
                        <span className="text-ink-400 mt-0.5 block truncate text-[0.6875rem]">
                          {room.note}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
