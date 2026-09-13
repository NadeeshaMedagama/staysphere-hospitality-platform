# Contributing to StaySphere

## Getting set up

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm docker:up
pnpm db:generate
pnpm dev
```

## Before you open a pull request

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

CI runs exactly this, plus a Docker build and a container smoke test for every
service. Running it locally first is faster than waiting for the pipeline.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), enforced by
commitlint on each commit and by CI on the pull request title.

```
feat(booking): add long-stay discount tiers
fix(auth): revoke the session when a refresh token is replayed
perf(gateway): reuse the upstream connection pool
docs(architecture): explain the projection trade-off
```

Allowed types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`,
`chore`, `revert`, `style`.

Scopes are the service or package name — `gateway`, `auth`, `booking`, `web`,
`admin`, `contracts`, `shared`, `infra`, `ci`, `deps`.

Subjects start lowercase and do not end with a period. The squash-merge commit
takes the PR title, which is why the title is checked too.

## Branches

```
feat/booking-long-stay-discounts
fix/auth-refresh-replay
docs/architecture-projections
```

## Code expectations

These are the ones that get raised in review, so they are worth knowing up front:

- **Money is integer minor units.** Use `Money` and its helpers. Never a float.
- **Dates are half-open `[checkIn, checkOut)`.** Use `overlaps()`.
- **No cross-service database access.** Consume an event, keep a projection.
- **Throw `DomainError`,** never a bare `Error` or `HttpException`.
- **Validate every inbound payload with Zod** via `zodBody(schema)`.
- **De-duplicate every consumer on `eventId`** with `consumeOnce()`.
- **Write state and its event in one transaction,** through the outbox.
- **Inject the clock** rather than calling `new Date()` in business logic.

## Tests

Test the behaviour, and name the test after it:

```ts
it('ignores a cancelled booking — it must not keep a room off the market', () => {
```

not

```ts
it('works', () => {
```

New logic needs its failure path covered, not just its happy path. A bug fix
should come with the test that would have caught it.

## Database changes

Migrations run in production **before** the new code is deployed, which means
the previous revision serves traffic against the new schema for a short window.
Migrations must therefore be backward compatible: add a nullable column now,
backfill, and drop the old one in a later release.

Say so explicitly in the pull request if a change cannot be made that way.

## Review

Reviewers look, in order, at: correctness of money, dates and availability;
authorisation; idempotency and transaction boundaries; error handling; then
tests. Formatting is not reviewed — Prettier and ESLint own it.

Pull requests over ~400 changed lines get a warning from CI. It is a nudge, not
a block, but smaller pull requests genuinely get better reviews.

## Reporting a vulnerability

Privately, through [Security Advisories](https://github.com/NadeeshaMedagama/StaySphere/security/advisories/new).
Not as a public issue. See [SECURITY.md](SECURITY.md).
