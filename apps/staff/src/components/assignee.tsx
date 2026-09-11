/**
 * Who a task belongs to.
 *
 * The name is optional in the housekeeping contract — it is only resolved when
 * the service chooses the assignee from the shift roster — so the id is what
 * decides whether anything is assigned at all. Showing "You" where it is the
 * signed-in person is the distinction that actually matters mid-round.
 */
export function Assignee({
  assignedToId,
  assignedToName,
  viewerId,
}: {
  assignedToId: string | null;
  assignedToName: string | null;
  viewerId: string;
}) {
  if (assignedToName) return <>{assignedToName}</>;
  if (assignedToId === viewerId) return <span className="font-medium">You</span>;
  if (assignedToId) return <>Assigned</>;
  return <span className="text-caution">Unassigned</span>;
}
