# CI/CD

Everything that runs in GitHub Actions, what triggers it, and what it needs to
be configured with.

---

## The pipelines at a glance

| Workflow                                                                          | Triggers                                  | Does                                                                                                                   |
| --------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [`ci.yml`](../.github/workflows/ci.yml)                                           | PR, push to `main`, merge queue           | Lockfile check, lint, format, commitlint, typecheck, tests on Node 20 + 22, build, Docker build + container smoke test |
| [`codeql.yml`](../.github/workflows/codeql.yml)                                   | PR, push to `main`, weekly                | CodeQL static analysis over TypeScript **and** the workflows themselves                                                |
| [`security.yml`](../.github/workflows/security.yml)                               | PR, push to `main`, weekly                | Dependency review with a licence deny-list, `pnpm audit`, gitleaks, Trivy image scanning                               |
| [`copilot-code-review.yml`](../.github/workflows/copilot-code-review.yml)         | PR opened/updated                         | Requests a Copilot review; enforces PR title convention, size labelling and a non-empty description                    |
| [`dependabot-auto-merge.yml`](../.github/workflows/dependabot-auto-merge.yml)     | Dependabot PR                             | Auto-merges low-risk bumps once checks pass; flags the rest for a human                                                |
| [`dependency-updates.yml`](../.github/workflows/dependency-updates.yml)           | Fortnightly, manual                       | Refreshes the whole lockfile, verifies it, opens one reviewable PR                                                     |
| [`release.yml`](../.github/workflows/release.yml)                                 | Manual, `v*` tag                          | Bumps versions, regenerates the changelog, tags, publishes a GitHub Release with signed bundles                        |
| [`publish-github-packages.yml`](../.github/workflows/publish-github-packages.yml) | Release published, manual                 | Publishes `contracts` and `service-core` to GitHub Packages with npm provenance                                        |
| [`publish-dockerhub.yml`](../.github/workflows/publish-dockerhub.yml)             | Release published, push to `main`, manual | Multi-arch images to GHCR **and** Docker Hub, cosign-signed, SBOM + SLSA provenance                                    |
| [`publish-marketplace.yml`](../.github/workflows/publish-marketplace.yml)         | Release published, `action.yml` change    | Validates and smoke-tests the composite action, moves the major tag                                                    |
| [`deploy-production.yml`](../.github/workflows/deploy-production.yml)             | Release published, manual                 | Migrations → Vercel frontends → service containers → smoke test                                                        |
| [`deploy-preview.yml`](../.github/workflows/deploy-preview.yml)                   | PR touching `apps/**`                     | Vercel preview per app, URL posted back to the PR                                                                      |

---

## Secrets and variables

Set these under **Settings → Secrets and variables → Actions**.

Nothing below is required to get a green CI run. Each integration detects
whether its credentials are present and **skips rather than fails** when they
are not — so a fresh clone or a fork has a working pipeline on day one, and you
add capability as you configure it.

### Secrets

| Name                       | Needed for                       | Where to get it                                                            |
| -------------------------- | -------------------------------- | -------------------------------------------------------------------------- |
| `VERCEL_TOKEN`             | Frontend deploys and previews    | Vercel → Account Settings → Tokens                                         |
| `VERCEL_ORG_ID`            | Frontend deploys                 | `.vercel/project.json` after `vercel link`, or Vercel → Settings → General |
| `VERCEL_PROJECT_ID_WEB`    | Deploying `apps/web`             | `.vercel/project.json` inside `apps/web`                                   |
| `VERCEL_PROJECT_ID_ADMIN`  | Deploying `apps/admin`           | `.vercel/project.json` inside `apps/admin`                                 |
| `NEON_DATABASE_URL`        | Production migrations            | Neon → Connection Details → **pooled** string                              |
| `NEON_DIRECT_URL`          | Production migrations            | Neon → Connection Details → **direct** string                              |
| `DOCKERHUB_USERNAME`       | Mirroring images to Docker Hub   | Your Docker Hub username                                                   |
| `DOCKERHUB_TOKEN`          | Mirroring images to Docker Hub   | Docker Hub → Account Settings → Personal access tokens                     |
| `CONTAINER_DEPLOY_WEBHOOK` | Triggering the container rollout | Your container host's deploy hook URL                                      |

`GITHUB_TOKEN` is provided automatically and covers GHCR pushes, package
publishing, PR comments and labels.

### Variables

| Name                 | Example                                  | Used by                                    |
| -------------------- | ---------------------------------------- | ------------------------------------------ |
| `PRODUCTION_API_URL` | `https://api.staysphere.example`         | Production smoke test, service health gate |
| `PRODUCTION_WEB_URL` | `https://staysphere.example`             | Production smoke test                      |
| `STAGING_API_URL`    | `https://api-staging.staysphere.example` | Preview builds                             |

### Environments

Create these under **Settings → Environments**:

| Environment           | Purpose                      | Suggested protection                                                         |
| --------------------- | ---------------------------- | ---------------------------------------------------------------------------- |
| `production`          | Frontend and service deploys | Required reviewer; restrict to `main` and tags                               |
| `production-database` | Migrations only              | Required reviewer — a migration is the least reversible step in the pipeline |
| `preview`             | PR previews                  | None                                                                         |

Splitting the database out means approving a schema change is a separate,
deliberate decision from approving a code deploy.

---

## Branch protection

Point the required check at **`CI passed`** — the aggregate gate at the end of
`ci.yml`. It fails when any upstream job did. Adding a job to CI therefore never
requires editing branch protection.

Recommended on `main`:

- Require pull request reviews (1 approval)
- Require status checks: `CI passed`, `Analyze javascript-typescript`
- Require branches to be up to date
- Require conversation resolution
- Do not allow bypassing the above

---

## First-time setup

1. **Push the repository.**

   ```bash
   git remote add origin https://github.com/NadeeshaMedagama/StaySphere.git
   git push -u origin main
   ```

   CI runs immediately and should pass with no secrets configured.

2. **Enable the security features.** Settings → Code security: turn on
   Dependabot alerts, Dependabot security updates, secret scanning and push
   protection. CodeQL is already configured by `codeql.yml`.

3. **Link the Vercel projects.**

   ```bash
   cd apps/web   && npx vercel link
   cd ../admin   && npx vercel link
   cd ../staff   && npx vercel link
   ```

   Copy the ids out of each `.vercel/project.json` into the secrets above.
   Set each Vercel project's **Root Directory** to its own `apps/<name>` folder.

4. **Add the Neon connection strings** once each service's database exists.

5. **Optionally add the Docker Hub credentials.** Without them, images still
   publish to GHCR.

---

## Cutting a release

```bash
gh workflow run release.yml -f bump=minor
```

That bumps every workspace to the same version, regenerates `CHANGELOG.md`,
tags, and publishes a GitHub Release. Publishing the release then triggers, in
parallel: GitHub Packages, container images, the Marketplace action tag, and the
production deployment.

To rehearse without pushing anything:

```bash
gh workflow run release.yml -f bump=minor -f dry-run=true
```

To roll back, redeploy the previous tag:

```bash
gh workflow run deploy-production.yml -f ref=v1.2.2
```

---

## Publishing the Marketplace action

`publish-marketplace.yml` validates `action.yml`, smoke-tests the action against
this repository and moves the `v1` tag. One step cannot be automated, because
GitHub exposes no API for it:

1. Open the release.
2. **Edit release**.
3. Tick **Publish this Action to the GitHub Marketplace**, accept the terms,
   choose a category (_Deployment_ / _Continuous integration_).
4. **Update release**.

Every later release inherits the listing.

---

## Running the checks locally

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

To lint the workflows themselves the way CI does:

```bash
brew install actionlint shellcheck
actionlint
```

---

## Design notes

**Why the matrix is discovered, not declared.** `ci.yml` and
`publish-dockerhub.yml` glob `services/*` at run time. Adding a service means
adding a directory — no workflow edit, and no chance of a service silently
missing from the build.

**Why credentials are detected in a preflight job.** The `secrets` context is
not available in a job-level `if:`. Each workflow resolves availability once in
a preflight job and passes the result downstream as an output, which is why a
missing `DOCKERHUB_TOKEN` skips a push instead of failing a run.

**Why pull requests never push images.** `pull_request` runs against code that
has not been reviewed. CI builds the image to prove it still builds, and loads
it locally for the smoke test, but no registry credential is ever in scope.

**Why there is one aggregate gate.** `CI passed` is the single required check.
Without it, every new job means a branch-protection change, and a job that is
accidentally skipped looks identical to one that passed.
