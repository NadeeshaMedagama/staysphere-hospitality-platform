<div align="center">

# StaySphere

**A hotel operations and reservation platform.**
One system for the guests who book and the teams who deliver the stay.

[![CI](https://github.com/NadeeshaMedagama/StaySphere/actions/workflows/ci.yml/badge.svg)](https://github.com/NadeeshaMedagama/StaySphere/actions/workflows/ci.yml)
[![CodeQL](https://github.com/NadeeshaMedagama/StaySphere/actions/workflows/codeql.yml/badge.svg)](https://github.com/NadeeshaMedagama/StaySphere/actions/workflows/codeql.yml)
[![Security](https://github.com/NadeeshaMedagama/StaySphere/actions/workflows/security.yml/badge.svg)](https://github.com/NadeeshaMedagama/StaySphere/actions/workflows/security.yml)
[![Release](https://github.com/NadeeshaMedagama/StaySphere/actions/workflows/release.yml/badge.svg)](https://github.com/NadeeshaMedagama/StaySphere/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-informational.svg)](LICENSE)

</div>

---

## The idea

Most hotel software treats the booking engine and the back of house as two
different products. StaySphere does not.

A guest checking out closes the folio, releases the room, raises the
housekeeping task and updates the front-desk floor board — as one chain of
events, not four things somebody has to remember to do.

```
Guest checks out
      │
      ▼
stay.guest-checked-out ──────► Kafka
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
  Housekeeping             Finance                  Front desk
  creates a clean          issues the invoice       board turns amber
```

That is the whole architectural bet: **domains own their data, and coordination
happens through events.** It is why the reservation path stays fast when
reporting is slow, and why a failing notification service cannot stop a guest
from booking a room.

---

## What is here

```
staysphere/
├── apps/
│   ├── web/                 Next.js 15 · guest booking site
│   ├── admin/               Next.js 15 · operations console
│   └── staff/               Next.js 15 · reception, housekeeping, maintenance, finance
│
├── services/                15 NestJS services, one bounded context each
│   ├── api-gateway/         Routing, edge auth, rate limiting, circuit breaking
│   ├── auth-service/        Identity, sessions, roles, refresh-token rotation
│   ├── hotel-service/       Properties, branches, amenities, policies
│   ├── room-service/        Room types, inventory, the operational status machine
│   ├── pricing-service/     Rate plans, seasons, promotions, demand pricing
│   ├── booking-service/     Availability, quoting, reservations, cancellation
│   ├── payment-service/     Captures, refunds, provider abstraction
│   ├── stay-service/        Check-in/out, the folio, in-stay services
│   ├── finance-service/     Invoices, tax, revenue
│   ├── housekeeping-service/ Cleaning queue, assignment, inspection
│   ├── maintenance-service/ Tickets, triage, SLA
│   ├── notification-service/ Templates, channels, preferences
│   ├── review-service/      Reviews, moderation, aggregate ratings
│   ├── reporting-service/   Occupancy, ADR, RevPAR, channel mix
│   └── audit-service/       Append-only trail with field-level diffs
│
├── packages/
│   ├── contracts/           Domain enums, 22 events, error codes, HTTP envelopes
│   ├── service-core/        Shared NestJS runtime
│   ├── ui/                  The design system: tokens and React components
│   ├── eslint-config/       Flat ESLint configs
│   └── typescript-config/   Shared tsconfig bases
│
├── e2e/                     Playwright, across all three front ends
├── infrastructure/
│   ├── docker/              Dockerfiles + the 25-container local stack
│   ├── kubernetes/          Manifests, overlays and the per-service renderer
│   └── monitoring/          Prometheus + Grafana provisioning
│
├── .github/                 12 workflows, Dependabot, templates
├── action.yml               Composite action published to the Marketplace
├── scripts/new-service.mjs  Scaffolds a new service's boilerplate
└── docs/                    Architecture, CI/CD, Kubernetes, testing
```

Every domain in the roadmap is implemented. Each service owns its own database,
publishes and consumes events through a shared catalogue, and exposes the same
health, readiness and metrics surface.

---

---

## Stack

| Layer         | Choice                            | Why                                                               |
| ------------- | --------------------------------- | ----------------------------------------------------------------- |
| Frontend      | Next.js 15, React 19, Tailwind v4 | App Router, server components, typed routes                       |
| Backend       | NestJS 10, TypeScript strict      | Consistent structure across many services                         |
| Database      | Neon PostgreSQL + Prisma 6        | Serverless Postgres, branch per environment, database per service |
| Cache         | Redis                             | Sessions, idempotency keys, rate limits                           |
| Events        | Kafka (KRaft)                     | Ordered per aggregate, replayable, at-least-once                  |
| Validation    | Zod                               | Strips unknown keys — mass assignment is not possible             |
| Observability | pino, Prometheus, Grafana         | Correlated structured logs, RED metrics                           |
| Build         | Turborepo + pnpm workspaces       | Cached task graph, `pnpm deploy` for lean images                  |
| CI/CD         | GitHub Actions                    | See [docs/ci-cd.md](docs/ci-cd.md)                                |

---

## Getting started

**Requirements:** Node 20+ (22 recommended), pnpm 9, and PostgreSQL.

Docker is optional — it only supplies PostgreSQL and, if you want them, Redis,
Kafka and the monitoring stack. Every service and application is a plain Node
process.

```bash
git clone https://github.com/NadeeshaMedagama/StaySphere.git
cd StaySphere

corepack enable            # provides pnpm at the pinned version
pnpm install

pnpm setup:local           # creates 14 databases and writes the .env files
pnpm db:generate           # generates the Prisma clients
pnpm db:migrate            # applies every schema
pnpm db:seed               # a demo property, 62 rooms, rates, one account per role

pnpm dev                   # every service and app, in watch mode
```

`pnpm setup:local` defaults to your local PostgreSQL. Point it at a hosted one —
Neon included — with `DATABASE_ADMIN_URL`; give it the pooled endpoint and it
derives the direct one that migrations need.

Prefer containers for everything? `pnpm docker:up` brings up the full stack
instead. Either way: **[docs/local-development.md](docs/local-development.md)**.

| Surface                      | URL                                |
| ---------------------------- | ---------------------------------- |
| Guest site                   | http://localhost:3100              |
| Operations console           | http://localhost:3200              |
| Staff app                    | http://localhost:3300              |
| API gateway                  | http://localhost:3000              |
| API docs (Swagger)           | http://localhost:3001/docs         |
| Kafka UI · MailHog · Grafana | 8080 · 8025 · 3301 _(Docker only)_ |

### Everyday commands

```bash
pnpm dev            # every app and service in watch mode
pnpm build          # build the whole workspace
pnpm test           # unit tests
pnpm test:cov       # with coverage
pnpm lint           # ESLint across the workspace
pnpm typecheck      # tsc --noEmit everywhere
pnpm format         # Prettier write

pnpm docker:up      # start the local stack
pnpm docker:logs    # follow it
pnpm docker:down    # stop it

pnpm setup:local    # create the databases and write the .env files
pnpm db:generate    # regenerate Prisma clients
pnpm db:migrate     # apply migrations
pnpm db:seed        # a demonstrable property, rooms, rates and one account per role
pnpm check:wiring   # structural checks type checking cannot express
```

### Signing in locally

`pnpm db:seed` creates one account per role, all sharing the password
`StaySphere-Dev-2026!`. The seed refuses to run when `NODE_ENV=production`.

| Account                         | Role                   |
| ------------------------------- | ---------------------- |
| `admin@staysphere.local`        | Platform administrator |
| `manager@staysphere.local`      | Duty manager           |
| `reception@staysphere.local`    | Receptionist           |
| `housekeeping@staysphere.local` | Housekeeping           |
| `maintenance@staysphere.local`  | Maintenance            |
| `finance@staysphere.local`      | Finance                |
| `guest@example.com`             | Guest                  |

---

## How it holds together

### Contracts before services

`@staysphere/contracts` is the only place a domain enum, an event payload or an
error code is defined. The gateway, every service and both front ends import the
same definitions, so a producer and a consumer cannot quietly disagree about
what `booking.confirmed` contains.

```ts
import { BookingStatus, canTransition, EventType } from '@staysphere/contracts';

canTransition(BookingStatus.PENDING, BookingStatus.CHECKED_IN); // false
```

### Money is never a float

```ts
import { money, multiplyMoney, formatMoney } from '@staysphere/contracts';

const nightly = money(12_000, 'USD'); // integer minor units
const weekend = multiplyMoney(nightly, 1.2); // 14400
formatMoney(weekend); // "$144.00"
```

`money(120.5, 'USD')` throws. Currency arithmetic across two currencies throws.
These are the bugs that turn into refunds.

### Nights, not days

Stays are half-open intervals `[checkIn, checkOut)`. A guest departing on the
4th and one arriving on the 4th **do not** overlap — which is exactly what makes
same-day turnover sellable.

### Writes and their events are atomic

A service writes its state change and the event it implies inside one
transaction, into an outbox table. A relay publishes from there afterwards.
"Booking saved but event lost" cannot happen, and neither can the reverse —
without a distributed transaction.

Delivery is at-least-once, so every consumer de-duplicates on `eventId`:

```ts
await consumeOnce(store, envelope, { consumerGroup: 'finance' }, async (event) => {
  await issueRefund(event.payload); // runs exactly once per event
});
```

### Failure is designed for

Circuit breakers per upstream, jittered exponential backoff, retry topics and a
dead-letter queue, request/correlation ids on every log line, `/health` and
`/ready` separated so a database blip does not get healthy pods killed.

---

## Testing

```bash
pnpm test                                          # 464 unit tests
pnpm --filter @staysphere/e2e run test:e2e         # 36 end-to-end tests
```

Unit tests target the logic that costs money when it is wrong: the booking state
machine, availability and overlap, nightly pricing across season and weekend
boundaries, cancellation refunds, refund caps, tax ordering, invoice numbering,
refresh-token rotation and replay detection, housekeeping prioritisation,
maintenance triage, the circuit breaker, the outbox relay and idempotent
consumption.

They are written as behaviour, not coverage:

```
✓ allows a same-day turnover — departure day is not occupied
✓ ignores a cancelled booking — it must not keep a room off the market
✓ flags replay of an already-rotated token
✓ caps stacked discounts at 90% so a folio can never go negative
✓ re-opens immediately when a half-open probe fails
```

---

## Deployment

Frontends deploy to **Vercel**; services build to **multi-architecture container
images** published to GHCR and Docker Hub, signed with cosign and carrying an
SBOM and SLSA provenance.

```bash
gh workflow run release.yml -f bump=minor
```

That bumps every workspace to one version, regenerates the changelog, tags, and
publishes a GitHub Release — which in turn triggers package publishing, image
publishing and the production deployment.

Full setup, secret list and rollback procedure: **[docs/ci-cd.md](docs/ci-cd.md)**.

> **A note on Vercel.** Vercel hosts the Next.js applications well. It cannot
> host the NestJS services — they hold long-lived Kafka consumers, Redis
> connections and Prisma pools that a serverless function model does not
> support. The pipeline reflects that split: frontends to Vercel, services to a
> container host.

---

## The Marketplace action

The root [`action.yml`](action.yml) publishes a reusable composite action,
**StaySphere Service Deploy** — build, push, deploy and health-gate a service in
one step:

```yaml
- uses: NadeeshaMedagama/StaySphere@v1
  with:
    service: booking-service
    image-namespace: ${{ github.repository_owner }}
    registry-username: ${{ github.actor }}
    registry-password: ${{ secrets.GITHUB_TOKEN }}
    health-url: https://api.example.com/health
```

The production pipeline uses it for its own deploys, so a regression is caught
here before it reaches any other consumer. Full reference:
**[docs/action.md](docs/action.md)**.

---

## Documentation

| Document                                                   | Contents                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)               | Service boundaries, data ownership, event flow, the trade-offs taken      |
| [docs/local-development.md](docs/local-development.md)     | Running the stack locally, with and without Docker                        |
| [docs/api-testing-postman.md](docs/api-testing-postman.md) | Verifying the API with Postman — what to check and what each check proves |
| [docs/testing.md](docs/testing.md)                         | Unit, integration and end-to-end tests                                    |
| [docs/ci-cd.md](docs/ci-cd.md)                             | Every workflow, required secrets, branch protection, release and rollback |
| [docs/kubernetes.md](docs/kubernetes.md)                   | Manifests, overlays and the deployment topology                           |
| [docs/action.md](docs/action.md)                           | The Marketplace action's inputs, outputs and recipes                      |
| [CONTRIBUTING.md](CONTRIBUTING.md)                         | Workflow, commit convention, review expectations                          |
| [SECURITY.md](SECURITY.md)                                 | Reporting a vulnerability, and the platform's own defences                |

---

## Contributing

Conventional Commits, enforced on both commits and PR titles. Run
`pnpm lint && pnpm typecheck && pnpm test` before opening a pull request — CI
runs exactly that, plus a container smoke test. See
[CONTRIBUTING.md](CONTRIBUTING.md).

---

## Licence

[MIT](LICENSE) © Nadeesha Medagama
