# Architecture

What the services are, what they own, how they talk, and which trade-offs were
taken deliberately.

---

## Shape

```
                        ┌──────────────────────────────┐
                        │  apps/web      apps/admin    │
                        │  guest site    operations    │
                        └───────────────┬──────────────┘
                                        │  HTTPS
                                        ▼
                        ┌──────────────────────────────┐
                        │        api-gateway           │
                        │  route table · edge auth     │
                        │  rate limit · circuit break  │
                        └───────────────┬──────────────┘
                        ┌───────────────┼───────────────┐
                        ▼               ▼               ▼
                 ┌────────────┐  ┌────────────┐  ┌────────────┐
                 │   auth     │  │  booking   │  │  (others)  │
                 └─────┬──────┘  └─────┬──────┘  └─────┬──────┘
                       │               │               │
                  ┌────▼────┐     ┌────▼────┐     ┌────▼────┐
                  │ Neon DB │     │ Neon DB │     │ Neon DB │
                  └─────────┘     └─────────┘     └─────────┘
                       │               │               │
                       └───────────────┼───────────────┘
                                       ▼
                            ┌─────────────────────┐
                            │   Kafka (KRaft)     │
                            │  one topic per      │
                            │  aggregate          │
                            └─────────────────────┘
```

---

## Service boundaries

Boundaries follow **what changes together**, not what reads together.

| Service           | Owns                                                        | Does not own                                 |
| ----------------- | ----------------------------------------------------------- | -------------------------------------------- |
| `auth-service`    | Users, sessions, refresh tokens, roles, audit trail         | Anything about a stay                        |
| `booking-service` | Reservations, nightly charges, status history, availability | Room definitions, rate definitions, payments |
| `api-gateway`     | Routing, edge authentication, rate limits, upstream health  | No domain data at all                        |

The gateway holds no database. The moment a gateway starts owning data it stops
being a gateway and becomes a distributed monolith's front half.

---

## Data ownership

**One database per service. No service reads another's tables.**

Booking needs to know about rooms and rates to answer "is anything free?". It
does not query the room service to find out. It keeps `RoomProjection` and
`RatePlanProjection` — local read models, updated from events.

This is the single most consequential decision in the design, so it is worth
being explicit about the trade:

**What it costs.** The projections are eventually consistent. A room taken out
of service propagates in milliseconds, not instantly. Two tables hold overlapping
truth, and the projection code has to exist.

**What it buys.** Availability — the hottest query in the entire platform, run on
every search — is one local indexed join. The alternative is a synchronous
fan-out to two services on every keystroke of a date picker, which couples the
booking path's availability to theirs and puts two more network hops in the
critical path. A guest searching for a room should not be able to fail because
the reporting service is slow.

The consistency window is acceptable because of what the data is: a room's
status changes a handful of times a day, and the booking transaction re-checks
against the authoritative unique index before it commits.

---

## The write path

Every state change follows the same shape:

```
┌─────────────────────────────────────────────┐
│  BEGIN                                       │
│    INSERT INTO bookings ...                  │
│    INSERT INTO outbox_events ...             │
│  COMMIT                                      │
└─────────────────────────────────────────────┘
                    │
                    ▼  relay, asynchronously
          ┌──────────────────┐
          │      Kafka       │
          └──────────────────┘
```

The transactional outbox exists because there is no transaction spanning
PostgreSQL and Kafka. Publishing inside the transaction risks an event for a
change that then rolls back; publishing after it risks a change with no event.
Writing both to the same database and relaying afterwards makes the pair atomic.

The cost is at-least-once delivery, which is why `consumeOnce()` is mandatory on
every consumer.

---

## Concurrency: the double-booking problem

Two guests search at the same instant, both see the last deluxe room, both
submit.

Availability is checked from projections — a _read_. Reads race. So the read is
an optimisation, not the guarantee. The guarantee is a unique index on
`(roomId, checkIn, checkOut)` for inventory-holding statuses: the second
transaction loses, Prisma raises `P2002`, and the service converts it to
`ROOM_NOT_AVAILABLE` rather than a 500.

The database is the arbiter. Application-level checks make the common case fast;
they never make it correct.

---

## Booking state machine

```
        ┌─────────┐
        │ PENDING │
        └────┬────┘
     ┌───────┴────────┐
     ▼                ▼
┌───────────┐   ┌───────────┐
│ CONFIRMED │   │ CANCELLED │ ◄── terminal
└─────┬─────┘   └───────────┘
      ├──────────────┬──────────────┐
      ▼              ▼              ▼
┌────────────┐ ┌───────────┐ ┌───────────┐
│ CHECKED_IN │ │ CANCELLED │ │  NO_SHOW  │
└─────┬──────┘ └───────────┘ └───────────┘
      ▼
┌─────────────┐
│ CHECKED_OUT │ ◄── terminal
└─────────────┘
```

The transition map lives in `@staysphere/contracts`, not in the booking service,
so every service that touches a booking validates identically. `CHECKED_IN →
CANCELLED` is absent on purpose: a stay in progress is shortened, not cancelled.

---

## Authentication

Access tokens are short-lived JWTs (15 minutes). Refresh tokens are opaque
CSPRNG bytes, stored only as a SHA-256 digest, and valid for exactly one use.

**Why the refresh token is not a JWT.** Revocation has to be authoritative. A
self-contained token stays valid until it expires, no matter what the server
thinks — so a sign-out would not actually sign anyone out.

**Why SHA-256 and not Argon2 for the digest.** The token is 256 bits of random
data. It is not brute-forcible, so a slow KDF would add latency to the refresh
hot path and buy nothing. Passwords are a different problem and do use Argon2id.

**Rotation and replay.** Presenting an already-rotated refresh token means
either the client replayed it or someone stole it. Those are indistinguishable,
so the safe response is to revoke the entire session
([OAuth 2.0 Security BCP §4.14.2](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)).

The gateway verifies the token once at the edge and forwards the resolved
principal as `x-staysphere-*` headers. Those headers are stripped from every
inbound request first, so a client cannot forge one.

---

## Errors

Every service throws `DomainError`. The code determines the HTTP status; a
filter renders the envelope:

```json
{
  "success": false,
  "error": {
    "code": "ROOM_NOT_AVAILABLE",
    "message": "That room was taken while your booking was being confirmed."
  },
  "requestId": "req_9f2b71ac"
}
```

Clients branch on `error.code`, never on message text. Unexpected errors are
logged in full and reported generically — an internal message could quote a
connection string.

---

## Observability

Every request gets a `requestId`; a `correlationId` follows the whole
interaction across services. Both are carried in `AsyncLocalStorage`, so every
log line has them without being passed through function signatures.

Metrics follow RED — rate, errors, duration — labelled by **route pattern**,
never resolved URL. Labelling by `/bookings/bkg_01H...` would create unbounded
cardinality and eventually take Prometheus down.

`/health` never touches a dependency; `/ready` does. Conflating them means a
database blip gets healthy pods killed and turns a degradation into an outage.

---

## Real-time

Front-of-house screens are watched continuously, and polling them is both
wasteful and always slightly wrong: a room reads dirty for another thirty
seconds after housekeeping released it, and the desk turns a guest away from a
room that is ready.

The gateway runs a Socket.IO namespace at `/realtime`. It carries no domain
logic — it authenticates the socket with the same access token, authorises a
subscription once at join time, and fans domain events to rooms:

```
stay.guest-checked-out
        │
        ▼
  channelsForEvent()
        │
   ┌────┼─────────────────┬──────────────────┐
   ▼    ▼                 ▼                  ▼
hotel:h:rooms   hotel:h:reception   hotel:h:housekeeping
 floor board      arrivals list        cleaning queue
```

**Channels are scoped to a property.** A client subscribes to
`hotel:<id>:rooms`, never to "all room updates". Without the scope a
receptionist at one property would receive the live floor board of every other
property on the platform.

**Authorisation happens on subscribe, not on publish.** Checking at publish time
would mean evaluating permissions once per connected client per event, and
getting it wrong once leaks the entire stream rather than a single message.

**Everything broadcast originates as a domain event.** There is no second path
from an HTTP handler to a socket that could disagree with what was persisted.

---

## Preventing a double booking, properly

The availability check in `booking-service` is a _read_, and reads race: two
requests can both see the last room free and both proceed. The application-level
check makes the common case fast; it cannot make it correct.

The guarantee is a PostgreSQL exclusion constraint:

```sql
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlapping_stay
  EXCLUDE USING gist (
    "roomId" WITH =,
    (daterange("checkIn", "checkOut", '[)')) WITH &&
  )
  WHERE ("roomId" IS NOT NULL AND "status" IN ('PENDING','CONFIRMED','CHECKED_IN'));
```

A plain unique index cannot express this, because the conflict is an _overlap of
ranges_ rather than equality of values. Three details carry the semantics:

- `'[)'` makes the range half-open, matching the platform's night semantics, so
  same-day turnover stays sellable.
- The `WHERE` clause limits it to statuses that hold inventory, so a cancelled
  booking does not keep a room off the market.
- `roomId IS NOT NULL` lets a reservation exist before a room is assigned.

Prisma's schema language cannot express a GiST range exclusion, so it lives in
`20260909000100_prevent_overlapping_bookings`. The service catches SQLSTATE
`23P01` alongside Prisma's `P2002` and returns `ROOM_NOT_AVAILABLE` rather than a
500 — a losing race is an expected outcome, not an error.

---

## What is deliberately not here yet

**Distributed tracing.** OpenTelemetry is wired in configuration but not
instrumented. Correlation ids cover the current three services; tracing earns
its keep at around six.

**A saga orchestrator.** Booking → payment → confirmation is currently a
choreography of events. An orchestrator becomes worthwhile when compensation
spans more than three services.

**Read/write splitting.** Neon supports read replicas. Adding them before there
is measured read pressure would be complexity without evidence.

**Kubernetes manifests.** The images are built and published; the compose stack
covers local development. Manifests belong with a real cluster, not ahead of one.

Each of these is a deliberate deferral, not an oversight. The architecture
leaves room for all four.
