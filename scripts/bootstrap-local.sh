#!/usr/bin/env bash
# Prepares every local database: applies migrations, then seeds a demonstrable
# property, its inventory, its rates and one account per role.
#
#   ./scripts/bootstrap-local.sh
#
# Idempotent — every seed upserts on a stable key, so re-running it is a no-op
# rather than a duplicate. Requires the local stack's Postgres to be up:
#
#   pnpm docker:up
set -euo pipefail

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-staysphere}"
PGPASSWORD="${PGPASSWORD:-staysphere_dev_password}"
export PGPASSWORD

# Services that own a database, and the database each one uses.
SERVICES=(
  auth booking hotel room pricing payment stay finance
  housekeeping maintenance notification review reporting audit
)

dsn() { echo "postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/staysphere_$1"; }

# Runs a query against a local database. Prefers a host psql; falls back to the
# stack's own Postgres container, so the script works on a machine that has
# Docker but no Postgres client installed — which is most of them.
PG_CONTAINER="${PG_CONTAINER:-}"
if [[ -z "$PG_CONTAINER" ]] && ! command -v psql >/dev/null 2>&1; then
  PG_CONTAINER=$(docker ps --filter 'name=postgres' --format '{{.Names}}' | head -1)
  if [[ -z "$PG_CONTAINER" ]]; then
    echo "Neither a host psql nor a running Postgres container was found." >&2
    echo "Start the stack first:  pnpm docker:up" >&2
    exit 1
  fi
fi

query() {
  local db="$1" sql="$2"
  if [[ -n "$PG_CONTAINER" ]]; then
    docker exec -e PGPASSWORD="$PGPASSWORD" "$PG_CONTAINER" \
      psql -U "$PGUSER" -d "staysphere_${db}" -tAc "$sql"
  else
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "staysphere_${db}" -tAc "$sql"
  fi
}

echo "▸ Applying migrations"
for name in "${SERVICES[@]}"; do
  url="$(dsn "$name")"
  printf '  %-16s ' "$name"
  if DATABASE_URL="$url" DIRECT_URL="$url" \
     pnpm --filter "@staysphere/${name}-service" exec prisma migrate deploy >/dev/null 2>&1; then
    echo "migrated"
  else
    echo "FAILED"
    DATABASE_URL="$url" DIRECT_URL="$url" \
      pnpm --filter "@staysphere/${name}-service" exec prisma migrate deploy 2>&1 | tail -5
    exit 1
  fi
done

echo
echo "▸ Seeding the hotel"
HOTEL_URL="$(dsn hotel)"
HOTEL_ID=$(DATABASE_URL="$HOTEL_URL" DIRECT_URL="$HOTEL_URL" \
  pnpm --filter @staysphere/hotel-service run db:seed 2>&1 \
  | sed -n 's/.*seeding rooms and rates: //p' | tr -d '[:space:]')

if [[ -z "$HOTEL_ID" ]]; then
  echo "  Could not determine the seeded hotel id." >&2
  exit 1
fi
echo "  hotel id: $HOTEL_ID"

echo
echo "▸ Seeding inventory, rates and accounts against $HOTEL_ID"
for name in room pricing auth; do
  url="$(dsn "$name")"
  printf '  %-16s ' "$name"
  if SEED_HOTEL_ID="$HOTEL_ID" DATABASE_URL="$url" DIRECT_URL="$url" \
     pnpm --filter "@staysphere/${name}-service" run db:seed >/dev/null 2>&1; then
    echo "seeded"
  else
    echo "FAILED"
    SEED_HOTEL_ID="$HOTEL_ID" DATABASE_URL="$url" DIRECT_URL="$url" \
      pnpm --filter "@staysphere/${name}-service" run db:seed 2>&1 | tail -8
    exit 1
  fi
done

echo
echo "▸ Projecting inventory and rates into booking-service"
# In a running platform these arrive as domain events. Without the broker up,
# the bootstrap hands booking the same rows directly — read from the owning
# service's database *here*, in the seeding tool, never by the service itself.
ROOMS_JSON=$(query room "
  SELECT coalesce(json_agg(json_build_object(
    'id', r.id, 'roomNumber', r.\"roomNumber\", 'roomTypeId', t.code,
    'floor', r.floor, 'maxOccupancy', r.\"maxOccupancy\"))::text, '[]')
  FROM rooms r JOIN room_types t ON t.id = r.\"roomTypeId\";")

RATES_JSON=$(query pricing "
  SELECT coalesce(json_agg(json_build_object(
    'roomTypeId', p.\"roomTypeId\", 'currency', p.currency,
    'baseRateMinor', p.\"baseRateMinor\",
    'weekendMultiplier', p.\"weekendMultiplier\"::float,
    'taxBasisPoints', p.\"taxBasisPoints\",
    'seasonalRates', coalesce((
      SELECT json_agg(json_build_object('label', s.label,
        'from', s.\"startsOn\", 'to', s.\"endsOn\",
        'nightlyRateMinor', s.\"nightlyRateMinor\"))
      FROM seasonal_rates s WHERE s.\"ratePlanId\" = p.id), '[]'::json),
    'longStayDiscounts', coalesce((
      SELECT json_agg(json_build_object('minNights', d.\"minNights\",
        'percentOff', d.\"basisPoints\"::float / 10000))
      FROM long_stay_discounts d WHERE d.\"ratePlanId\" = p.id), '[]'::json)
  ))::text, '[]')
  FROM rate_plans p WHERE p.published;")

BOOKING_URL="$(dsn booking)"
printf '  %-16s ' "booking"
if SEED_HOTEL_ID="$HOTEL_ID" SEED_ROOMS="$ROOMS_JSON" SEED_RATE_PLANS="$RATES_JSON" \
   DATABASE_URL="$BOOKING_URL" DIRECT_URL="$BOOKING_URL" \
   pnpm --filter @staysphere/booking-service run db:seed >/dev/null 2>&1; then
  echo "projected"
else
  echo "FAILED"
  SEED_HOTEL_ID="$HOTEL_ID" SEED_ROOMS="$ROOMS_JSON" SEED_RATE_PLANS="$RATES_JSON" \
    DATABASE_URL="$BOOKING_URL" DIRECT_URL="$BOOKING_URL" \
    pnpm --filter @staysphere/booking-service run db:seed 2>&1 | tail -8
  exit 1
fi

echo
echo "✓ Local databases ready."
echo "  Sign in with any seeded account and the password StaySphere-Dev-2026!"
echo "  Hotel id for API calls: $HOTEL_ID"
