# Copilot instructions for StaySphere

Context for GitHub Copilot when suggesting code and reviewing pull requests in
this repository.

## What this is

An event-driven hotel operations and reservation platform. Independent NestJS
services own their own PostgreSQL (Neon) databases and communicate over Kafka;
two Next.js applications sit in front of them behind an API gateway.

```
apps/web        Next.js 15  · guest-facing booking site
apps/admin      Next.js 15  · staff operations console
services/*      NestJS 10   · one bounded context each, one database each
packages/contracts     shared enums, events, error codes, HTTP envelopes
packages/service-core  shared NestJS runtime (config, logging, errors, health)
```

## Rules that are not negotiable

**Money is integer minor units.** Never a float, never a `number` of dollars.
Use `Money` and the helpers in `@staysphere/contracts` — `addMoney`,
`multiplyMoney`, `sumMoney`. A suggestion that multiplies a price by `0.1` in
plain JavaScript is wrong.

**Dates are half-open `[checkIn, checkOut)`.** A guest departing on the 4th and
one arriving on the 4th do not overlap. Overlap checks use `overlaps()` from
`services/booking-service/src/domain/date-range.ts`. A closed-interval
comparison is a bug.

**No service reads another service's database.** Cross-context data arrives as
an event and is stored as a local projection (see `RoomProjection`). If a
suggestion adds a foreign key across contexts, it is wrong.

**Every service throws `DomainError`, never a bare `Error` or `HttpException`.**
The code comes from `ErrorCode`; the HTTP status is derived from it. This keeps
the wire format identical across services.

**Every inbound payload is validated with Zod.** Use `zodBody(schema)`. Zod
strips unknown keys, which is what stops mass assignment — never hand-parse a
request body.

**Consumers de-duplicate on `eventId`.** Kafka delivers at least once. Wrap
handlers in `consumeOnce()`; a replayed `payment.completed` must not charge a
guest twice.

**State changes and their events are written in one transaction.** Write the row
and the outbox record together; the relay publishes afterwards. Never publish
inside a transaction, and never publish before committing.

**Secrets never appear in source.** Not in a default value, not in a test
fixture, not in a comment. Configuration goes through the Zod-validated env
schema in each service's `config/env.ts`.

## Conventions

- TypeScript strict mode. Prefer `type` imports (`import type`).
- Enums are `as const` objects plus a derived type, not TypeScript `enum`.
- Injected clocks (`CLOCK`) rather than `new Date()` inside business logic, so
  time-dependent behaviour is testable.
- Conventional Commits, enforced by commitlint and on the PR title.
- Tests describe behaviour: `it('refunds nothing under three days notice')`,
  not `it('works')`.

## When reviewing

Prioritise, in this order:

1. **Correctness of money, dates and availability.** Double-booking and
   mis-charging are the failures that actually hurt.
2. **Authorisation.** Does the route declare `@RequirePermissions`? Can a
   `CUSTOMER` reach another guest's booking?
3. **Idempotency and transactional boundaries.** Would a retry double-apply?
4. **Error handling.** Does an internal message leak to the client?
5. **Tests.** Is the new branch covered, including its failure path?

Do not spend review comments on formatting — Prettier and ESLint own that and
run in CI.
