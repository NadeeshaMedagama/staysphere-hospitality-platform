# Testing

What is tested, at which level, and why the line falls where it does.

---

## The shape

```
464 unit tests      pure domain logic, no I/O            ~20 s
 36 E2E tests       the three front ends, real browser   ~8 s
```

Unit tests dominate deliberately. The rules that cost money when they are wrong
— overlapping bookings, refund caps, tax ordering, token replay — are pure
functions, and a pure function is exhaustively testable in milliseconds. Pushing
those cases into browser tests would make the suite slower, flakier and no more
truthful.

---

## Unit tests

Every service keeps its genuinely interesting rule in a module with no database
or HTTP dependency, tested directly:

| Module                         | What it protects                                                      |
| ------------------------------ | --------------------------------------------------------------------- |
| `contracts/domain/money`       | Currency is integer minor units; cross-currency arithmetic throws     |
| `contracts/domain/booking`     | The reservation state machine; `CHECKED_IN → CANCELLED` is impossible |
| `booking/domain/date-range`    | Half-open nights, so same-day turnover stays sellable                 |
| `booking/domain/availability`  | A cancelled booking never keeps a room off the market                 |
| `booking/domain/quote`         | Pricing across season and weekend boundaries; discounts capped at 90% |
| `booking/domain/cancellation`  | Refund and retained always sum to the amount paid                     |
| `auth/refresh-rotation`        | A replayed refresh token revokes the whole session                    |
| `auth/lockout`                 | Lockout at the threshold, not before or after                         |
| `payment/refund`               | Two half-refunds cannot return 150% of the capture                    |
| `finance/tax`                  | Discount before tax; inclusive tax extracted, not added               |
| `finance/invoice-number`       | Gap-free, zero-padded, sorts correctly as text                        |
| `room/room-status`             | An occupied room cannot be taken out of service                       |
| `housekeeping/prioritisation`  | The next arrival, not queue order, sets urgency                       |
| `maintenance/sla`              | Any fault in an occupied room escalates regardless of report          |
| `notification/routing`         | An opt-out never suppresses a booking confirmation                    |
| `review/moderation`            | Criticism is published; only unpublishable content is rejected        |
| `reporting/kpi`                | ADR and RevPAR divide by different denominators                       |
| `audit/diff`                   | A changed secret is recorded without its value                        |
| `service-core/circuit-breaker` | A half-open probe that fails re-opens immediately                     |
| `service-core/idempotency`     | A failed handler releases its claim so the retry runs                 |

```bash
pnpm test        # everything
pnpm test:cov    # with coverage
```

Tests are named after the behaviour, not the function:

```
✓ allows a same-day turnover — departure day is not occupied
✓ accounts for prior refunds, so two half-refunds cannot exceed the capture
✓ applies the discount before tax, so the guest is not taxed on it
✓ makes rework critical regardless of anything else
```

---

## End-to-end tests

Playwright drives the three front ends in a real browser. The guest journey runs
on desktop and mobile viewports, because that is where the booking actually
happens.

```bash
pnpm --filter @staysphere/e2e exec playwright install chromium   # once
pnpm --filter @staysphere/e2e run test:e2e
pnpm --filter @staysphere/e2e run test:e2e:ui                    # watch mode
```

Playwright starts the applications itself, so a laptop run and a CI run are the
same run. Pointing `E2E_WEB_URL` at a deployed environment runs the identical
suite as a post-deploy smoke test.

These tests earned their keep immediately. Writing them surfaced three genuine
defects that unit tests could not have caught:

- The homepage search form's custom validation message was unreachable — native
  constraint validation blocked submit, so an invalid date range produced only
  an unstyled browser tooltip.
- The operations console's room board was a plain `<section>`, so it was never
  exposed as a landmark a screen-reader user could navigate to.
- The console rendered two `<h1>` elements, breaking heading navigation.

---

## Structural checks

`pnpm check:wiring` asserts invariants that neither type checking nor unit tests
can express. Every one of them exists because its absence produced a runtime
failure that all the other gates passed cleanly:

| Invariant                                                             | What its absence causes                                                                                                                                                  |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Every service registers `AuthorizationGuard`                          | `@RequireRoles` and `@RequirePermissions` become inert — the decorators write metadata nothing reads, and every protected route is reachable by any authenticated caller |
| Every service applies `ForwardedPrincipalMiddleware`                  | The gateway forwards a verified principal that nothing reads, so every authenticated route fails closed                                                                  |
| No injected class is imported with `import type`                      | The reference is erased, `emitDecoratorMetadata` emits `Function`, and Nest fails at boot with _"argument Function at index [0]"_                                        |
| Every service with a Prisma schema copies `src/generated` into `dist` | The built service cannot require its own client, though the build and tests both pass                                                                                    |

It runs in CI alongside lint and format.

---

## Running the stack for real

Unit tests, E2E tests and a green build together still missed every one of the
bugs above, because each lived in wiring rather than logic. Bringing the stack up
against a real database is a separate gate, and it is worth doing before a
release:

```bash
pnpm docker:up                    # Postgres, Redis, Kafka
./scripts/bootstrap-local.sh      # migrations, then seeds
pnpm dev
```

Then exercise the paths that carry money:

```bash
API=http://localhost:3000/api/v1
TOKEN=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"guest@example.com","password":"StaySphere-Dev-2026!"}' \
  | jq -r .data.tokens.accessToken)

curl -s "$API/bookings/availability?hotelId=$HOTEL&roomTypeId=DELUXE&checkIn=2026-11-02&checkOut=2026-11-05&adults=2"
curl -s -X POST "$API/bookings" -H "Authorization: Bearer $TOKEN" \
  -H 'Idempotency-Key: local-1' -H 'Content-Type: application/json' -d '{ … }'
```

Check specifically that `/health`, `/ready` and `/metrics` answer `200` **without
a token and without a version prefix** — those are the exact paths the
Kubernetes probes and the Prometheus scrape use, and they are easy to break
without any test noticing.

---

## What is not tested, and why

**Controllers and Prisma queries.** A test that mocks Prisma asserts that the
mock was called, which is a restatement of the implementation rather than a
check on it. The queries are exercised through the containers CI actually starts;
the logic worth protecting lives in the pure modules above.

**Integration tests against a live database.** The next layer worth adding.
Testcontainers with a real Postgres would let the availability unique index and
the outbox transaction be tested for real, which is where the remaining risk
sits.

**Contract tests between services.** `@staysphere/contracts` gives producers and
consumers one compile-time definition of every event, which removes most of the
drift a consumer-driven contract test would catch. Worth revisiting when a
service outside this repository starts consuming the events.

---

## In CI

`ci.yml` runs unit tests on Node 20 and 22, the E2E suite against freshly built
front ends, a Docker build with a container health check for every service, and
`kubeconform` over every rendered Kubernetes manifest. The `CI passed` job
aggregates all of it into the single required status check.
