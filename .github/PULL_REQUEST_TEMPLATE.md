## What changed

<!-- One paragraph. What does this do, and why now? -->

## Why

<!-- The problem being solved. Link the issue: Closes #123 -->

## How it works

<!-- Only if the approach is non-obvious. Call out anything a reviewer would
     otherwise have to reverse-engineer from the diff. -->

## Type of change

- [ ] `feat` — new capability
- [ ] `fix` — bug fix
- [ ] `perf` — performance
- [ ] `refactor` — no behaviour change
- [ ] `docs` — documentation only
- [ ] `test` — tests only
- [ ] `build` / `ci` — tooling, pipeline, infrastructure
- [ ] `chore` — maintenance

## Affected surfaces

- [ ] `api-gateway`
- [ ] `auth-service`
- [ ] `booking-service`
- [ ] `apps/web`
- [ ] `apps/admin`
- [ ] `packages/contracts` — **breaking for every consumer; note the version bump**
- [ ] `packages/service-core`
- [ ] Infrastructure / CI

## Verification

<!-- What did you actually run? Paste the meaningful output, not just "tests pass". -->

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] Exercised locally against `pnpm docker:up`

## Database

- [ ] No schema change
- [ ] Migration included, and it is **backward compatible** — the previous
      revision keeps working against the new schema while the rollout completes
- [ ] Migration is destructive and needs a coordinated deploy (explain below)

## Events and contracts

- [ ] No event or contract change
- [ ] New event added to `EVENT_CATALOG` with a payload schema
- [ ] Existing payload changed **additively** (optional fields only)
- [ ] Breaking payload change — version bumped and consumers identified below

## Security

- [ ] No new external input
- [ ] New input is validated with a Zod schema
- [ ] Authorisation checked (`@RequirePermissions` / `@RequireRoles`)
- [ ] No secret, token or credential added to the repository

## Screenshots

<!-- UI changes: before and after. Delete this section otherwise. -->

## Rollback

<!-- How is this undone if it misbehaves in production? -->
