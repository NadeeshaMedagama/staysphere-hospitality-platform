import { RoomBoard } from '@/components/room-board';
import { roomBoard, type Scope } from '@/lib/data';
import { SectionFailure } from '@/components/section-state';

export async function RoomsSection({ scope }: { scope: Scope }) {
  const result = await roomBoard(scope);
  if (!result.ok) return <SectionFailure failure={result} service="The room service" />;

  if (result.data.length === 0) {
    return (
      <div className="rounded-card border-line border border-dashed bg-white p-8 text-center">
        <h2 className="text-ink-900 text-sm font-semibold">No rooms configured</h2>
        <p className="text-ink-500 mx-auto mt-2 max-w-sm text-sm">
          This property has no rooms on file yet, so there is no board to show.
        </p>
      </div>
    );
  }

  return (
    <RoomBoard
      floors={result.data.map((floor) => ({
        floor: floor.floor,
        rooms: floor.rooms.map((room) => ({
          number: room.number,
          status: room.status,
          ...(room.note ? { note: room.note } : {}),
        })),
      }))}
    />
  );
}
