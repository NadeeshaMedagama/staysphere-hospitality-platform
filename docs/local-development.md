# Running StaySphere locally

**Docker is optional.** It only supplies PostgreSQL, and — if you want them —
Redis, Kafka, MailHog, Prometheus and Grafana. The services and the three
Next.js applications are plain Node processes that `pnpm dev` runs directly.

PostgreSQL is the only hard dependency. `REDIS_URL` and `KAFKA_BROKERS` are
optional in the environment schema, so the platform starts and the whole guest
journey works without either.

---

## Without Docker

If you already have PostgreSQL on your machine, this is the whole setup:

```bash
corepack enable          # provides pnpm at the pinned version
pnpm install

pnpm setup:local         # creates 14 databases and writes the .env files
pnpm db:generate         # generates the Prisma clients
pnpm db:migrate          # applies every schema
pnpm db:seed             # a demo property, 62 rooms, rates, one account per role

pnpm dev                 # every service and app, in watch mode
```

`pnpm setup:local` defaults to `postgresql://<your-username>@localhost:5432/postgres`,
which is what a Homebrew or Postgres.app install gives you. Point it anywhere
else — another host, a container, or a Neon branch — with:

```bash
DATABASE_ADMIN_URL=postgresql://user:password@host:5432/postgres pnpm setup:local
```

It is idempotent: existing databases are left alone, and an existing `.env` is
never overwritten, so secrets you have edited survive a re-run.

### Using Neon

Neon publishes two endpoints for the same branch. Give the setup script the
**pooled** one — the `-pooler` host from the dashboard — and it derives the
direct endpoint itself:

```bash
DATABASE_ADMIN_URL='postgresql://USER:PASSWORD@ep-xxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require' \
  pnpm setup:local

pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm dev
```

It creates one database per service inside the branch and writes each service's
`.env` with both endpoints:

- `DATABASE_URL` → the **pooled** endpoint, with `connection_limit=5`. Prisma
  otherwise opens `num_cpus * 2 + 1` connections per client, which across
  fourteen services is several hundred against one branch.
- `DIRECT_URL` → the **direct** endpoint. `CREATE DATABASE` cannot run inside
  the transaction PgBouncer wraps every statement in, and Prisma Migrate takes
  advisory locks the pooler does not forward.

Everything works on Neon unchanged, including the GiST exclusion constraint that
makes double-booking impossible — `btree_gist` is available there.

Free-tier branches suspend after inactivity, so the first request after a pause
takes a second or two while the compute wakes.

### No PostgreSQL yet?

One container, and nothing else:

```bash
docker run -d --name staysphere-pg -p 5432:5432 \
  -e POSTGRES_USER=staysphere -e POSTGRES_PASSWORD=staysphere \
  postgres:17-alpine

DATABASE_ADMIN_URL=postgresql://staysphere:staysphere@localhost:5432/postgres pnpm setup:local
```

---

## With Docker

The full stack — every service, both consoles, the guest site, and the
supporting infrastructure — as containers:

```bash
pnpm docker:up
pnpm docker:logs
pnpm docker:down
```

Host ports are overridable, because a native PostgreSQL on 5432 will otherwise
win the bind and every service will quietly talk to the wrong database:

```bash
POSTGRES_PORT=55432 REDIS_PORT=6380 pnpm docker:up
```

---

## What runs where

| Surface               | URL                        | Started by  |
| --------------------- | -------------------------- | ----------- |
| Guest site            | http://localhost:3100      | `pnpm dev`  |
| Operations console    | http://localhost:3200      | `pnpm dev`  |
| Staff app             | http://localhost:3300      | `pnpm dev`  |
| API gateway           | http://localhost:3000      | `pnpm dev`  |
| Swagger (per service) | http://localhost:3001/docs | `pnpm dev`  |
| Kafka UI              | http://localhost:8080      | Docker only |
| MailHog               | http://localhost:8025      | Docker only |
| Grafana               | http://localhost:3301      | Docker only |

Services occupy ports 3000–3014, one each, in the order they appear in
`scripts/setup-local.mjs`.

---

## Running only part of the stack

Eighteen watch processes is a lot for a laptop. Turbo filters let you run what
you are actually working on:

```bash
# The guest booking path and nothing else
pnpm dev --filter=@staysphere/api-gateway \
         --filter=@staysphere/auth-service \
         --filter=@staysphere/hotel-service \
         --filter=@staysphere/room-service \
         --filter=@staysphere/pricing-service \
         --filter=@staysphere/booking-service \
         --filter=@staysphere/web

# One front end against an already-running API
pnpm dev --filter=@staysphere/admin
```

An upstream the gateway cannot reach answers `UPSTREAM_UNAVAILABLE` for its
routes rather than failing to start, so a partial stack is a working stack.

---

## Signing in

Every seeded account shares the password `StaySphere-Dev-2026!`. The seed
refuses to run when `NODE_ENV=production`.

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

## Checking it works

```bash
pnpm smoke
```

Drives a full hotel lifecycle across every running service — sign in as six
roles, browse, price, book, pay, check in, post to the folio, check out, queue a
clean, raise a ticket, read the reports, write to the audit trail — and asserts
the authorisation boundaries at each step. 35 checks.

It exists because unit tests, E2E tests and a green build together still missed
nine wiring bugs that only appeared once the services actually talked to each
other. Point it at a deployed environment with `API_URL`.

### By hand

```bash
API=http://localhost:3000/api/v1

# Probes — no token, no version prefix. These are the paths Kubernetes and
# Prometheus use, and they are easy to break without a test noticing.
curl -s http://localhost:3000/health | jq .
curl -s http://localhost:3000/ready  | jq .

TOKEN=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"guest@example.com","password":"StaySphere-Dev-2026!"}' \
  | jq -r .data.tokens.accessToken)

HOTEL=$(curl -s "$API/hotels" | jq -r '.data[0].id')

curl -s "$API/bookings/availability?hotelId=$HOTEL&roomTypeId=DELUXE&checkIn=2026-11-02&checkOut=2026-11-05&adults=2" | jq .data

curl -s -X POST "$API/bookings" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: local-1' \
  -d "{\"hotelId\":\"$HOTEL\",\"roomTypeId\":\"DELUXE\",\"checkIn\":\"2026-11-02\",\"checkOut\":\"2026-11-05\",\"adults\":2,\"guestName\":\"Local Test\",\"guestEmail\":\"guest@example.com\"}" | jq .data
```

---

## How configuration is loaded

Each service reads its own `services/<name>/.env`, loaded by `dotenv-cli` in the
`dev`, `db:migrate` and `db:seed` scripts only. Nothing in the production path
depends on a file being present — containers and Kubernetes inject the
environment directly, and `main.ts` reads `process.env` through a Zod schema
that fails fast and prints every offending key at once.

Each service gets its own `DATABASE_URL` because each owns its own database.
That is the point of the architecture, and it is why a single root `.env` cannot
express it.

---

## Troubleshooting

**`P1010: User was denied access`** — something else is listening on 5432.
A native PostgreSQL wins the bind over a container, so the service connects to
the wrong server. Check with `lsof -nP -iTCP:5432 -sTCP:LISTEN`, then either use
the native one or move the container with `POSTGRES_PORT=55432`.

**`services/<name>/.env is missing`** — run `pnpm setup:local`.

**`Cannot find module '../generated/prisma'`** — run `pnpm db:generate`. The
Prisma client is generated per service into `src/generated/prisma`, because
pnpm resolves the default output into the shared store where services would
overwrite one another's client.

**`EADDRINUSE`** — a previous run is still holding the port:
`lsof -nP -iTCP:3000-3014 -sTCP:LISTEN -t | xargs kill`.

**A service starts but every authenticated route returns 401** — the gateway
forwards the verified principal as `x-staysphere-*` headers, and
`ForwardedPrincipalMiddleware` turns them back into a principal. `pnpm check:wiring`
asserts every service applies it.
