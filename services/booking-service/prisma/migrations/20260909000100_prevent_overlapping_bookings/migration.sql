-- Prevents two reservations from holding the same room on the same night.
--
-- The availability check in the application is a *read*, and reads race: two
-- requests can both see the last room free and both proceed. The database has
-- to be the arbiter, not the application.
--
-- A plain UNIQUE index cannot express this, because the conflict is an overlap
-- of date ranges rather than equality of values. PostgreSQL's exclusion
-- constraint is exactly the right tool: it rejects any row whose (room, dates)
-- pair overlaps an existing one.
--
-- Three details matter:
--
--   * `'[)'` makes the range half-open, matching the platform's night
--     semantics — a guest departing on the 4th and one arriving on the 4th do
--     not conflict, so same-day turnover stays sellable.
--   * The WHERE clause limits the constraint to statuses that actually hold
--     inventory. A cancelled or no-show booking must not keep a room off sale.
--   * `roomId IS NOT NULL` allows a reservation to exist before a specific room
--     is assigned.

-- GiST indexing over scalar types is what lets `=` and `&&` combine in one
-- constraint.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlapping_stay"
  EXCLUDE USING gist (
    "roomId" WITH =,
    (daterange("checkIn", "checkOut", '[)')) WITH &&
  )
  WHERE (
    "roomId" IS NOT NULL
    AND "status" IN ('PENDING', 'CONFIRMED', 'CHECKED_IN')
  );

-- Verified against PostgreSQL 16 with the following cases:
--   room 305, Oct 1–4 CONFIRMED            → accepted
--   room 305, Oct 2–5 CONFIRMED            → rejected (23P01)
--   room 305, Oct 4–7 CONFIRMED            → accepted  (same-day turnover)
--   room 306, Oct 1–4 CONFIRMED            → accepted  (different room)
--   room 305, Oct 2–3 CANCELLED            → accepted  (holds no inventory)
--   room 305, Oct 2–3 PENDING              → rejected (23P01)
--   roomId NULL, Oct 1–4, twice            → both accepted (unassigned)
--   after cancelling the first, the overlap → accepted

COMMENT ON CONSTRAINT "bookings_no_overlapping_stay" ON "bookings" IS
  'Two reservations may not hold the same room on the same night. Half-open [) so same-day turnover is permitted.';
