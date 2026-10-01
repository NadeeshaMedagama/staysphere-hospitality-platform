# Security policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.x     | ✅        |
| < 1.0   | ❌        |

## Reporting a vulnerability

**Please do not open a public issue.**

Report privately through
[GitHub Security Advisories](https://github.com/NadeeshaMedagama/StaySphere/security/advisories/new).

Include, as far as you can establish it:

- the affected component and version
- what an attacker can achieve, and what access they need to start
- reproduction steps or a proof of concept
- any suggested remediation

You can expect an acknowledgement within 48 hours, an initial assessment within
five working days, and progress updates until the issue is resolved.
Fixes ship as a patch release with an advisory crediting the reporter, unless
they ask otherwise.

## Scope

In scope: everything in this repository — the services, the front ends, the
Docker images and the GitHub Actions workflows.

Out of scope: findings that require an already-compromised host, denial of
service by brute volume, and reports produced by a scanner without a
demonstrated impact.

## What the platform does to protect itself

**Authentication.** Argon2id password hashing at OWASP-recommended parameters.
Short-lived access tokens with opaque, single-use refresh tokens; a replayed
refresh token revokes the whole session. Temporary lockout after repeated
failures, and uniform responses so the login endpoint cannot be used to
enumerate accounts.

**Authorisation.** Role- and permission-based, evaluated from a single matrix in
`@staysphere/contracts`. Routes fail closed — a route is protected unless
someone deliberately marks it `@Public()`.

**Input handling.** Every payload is parsed by a Zod schema that strips unknown
keys, so a client cannot smuggle a privileged field into an update.

**Data.** Database per service. Refresh tokens stored only as SHA-256 digests.
Card data never touches StaySphere systems — it is handled by the payment
provider.

**Supply chain.** Dependabot, `pnpm audit`, dependency review with a licence
deny-list, CodeQL, gitleaks and Trivy image scanning all run in CI. Published
images are signed with cosign and carry an SBOM and SLSA provenance.

**Operations.** Structured logs with a redaction list covering credentials and
tokens; every request carries a correlation id; security-relevant actions are
recorded in an append-only audit log.
