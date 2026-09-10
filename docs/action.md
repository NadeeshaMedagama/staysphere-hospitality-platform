# StaySphere Service Deploy

A composite GitHub Action that takes a containerised microservice from source to
a verified production rollout in one step: multi-architecture image build, push
to any OCI registry, deployment trigger, and a health gate that fails the job if
the new revision never becomes healthy.

Published to the GitHub Marketplace from the root [`action.yml`](../action.yml)
of this repository.

---

## Why it exists

Most pipelines express a deploy as five separate steps — set up Buildx, log in,
build, push, then a hand-rolled `curl` loop to check the thing actually came up.
That block gets copied into every service's workflow and then drifts. This action
is that block, once, with the health gate treated as part of the deploy rather
than an afterthought.

The health gate matters most. A push that succeeds tells you the registry
accepted some bytes. It tells you nothing about whether the service starts. This
action polls until the deployment answers `200`, and fails the workflow when it
does not — so a broken release stops the pipeline instead of quietly becoming
production.

---

## Quick start

```yaml
- uses: NadeeshaMedagama/StaySphere@v1
  with:
    service: booking-service
    image-namespace: ${{ github.repository_owner }}
    registry-username: ${{ github.actor }}
    registry-password: ${{ secrets.GITHUB_TOKEN }}
    health-url: https://api.example.com/health
```

That builds `infrastructure/docker/Dockerfile.service` with
`SERVICE=booking-service`, pushes
`ghcr.io/<owner>/staysphere-booking-service` tagged with the version and commit
SHA, then waits for `https://api.example.com/health` to return `200`.

---

## Inputs

### Identity

| Input     | Required | Default | Description                                                                                    |
| --------- | -------- | ------- | ---------------------------------------------------------------------------------------------- |
| `service` | **yes**  | —       | Service name. Used for the image name and passed to the Dockerfile as the `SERVICE` build arg. |
| `version` | no       | git ref | Version tag. Falls back to the tag name without a leading `v`, or the short SHA on a branch.   |

### Build

| Input         | Required | Default                                    | Description                                                                                          |
| ------------- | -------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `context`     | no       | `.`                                        | Docker build context.                                                                                |
| `dockerfile`  | no       | `infrastructure/docker/Dockerfile.service` | Path to the Dockerfile.                                                                              |
| `platforms`   | no       | `linux/amd64`                              | Comma-separated target platforms. QEMU is set up automatically when a non-x86 platform is requested. |
| `build-args`  | no       | —                                          | Extra build arguments, one `KEY=VALUE` per line.                                                     |
| `cache-scope` | no       | `service`                                  | Scope key for the GitHub Actions build cache.                                                        |

### Registry

| Input               | Required | Default                | Description                                                                                     |
| ------------------- | -------- | ---------------------- | ----------------------------------------------------------------------------------------------- |
| `image-namespace`   | **yes**  | —                      | Registry namespace — an organisation, user or project.                                          |
| `registry`          | no       | `ghcr.io`              | Registry host.                                                                                  |
| `image-name`        | no       | `staysphere-<service>` | Image name within the namespace.                                                                |
| `registry-username` | no       | —                      | Registry username.                                                                              |
| `registry-password` | no       | —                      | Registry password or token. **Always pass a secret.**                                           |
| `push`              | no       | `true`                 | Set to `false` to build without pushing — the usual choice on a pull request.                   |
| `extra-tags`        | no       | —                      | Additional tags, one per line. Bare (`latest`) or fully qualified (`docker.io/ns/name:latest`). |

### Deploy

| Input            | Required | Default | Description                                                                        |
| ---------------- | -------- | ------- | ---------------------------------------------------------------------------------- |
| `deploy-webhook` | no       | —       | URL called with `POST` after a successful push. Skipped when empty.                |
| `deploy-payload` | no       | auto    | JSON body for the webhook. Defaults to service, image, version, digest and commit. |

### Health

| Input             | Required | Default | Description                                                      |
| ----------------- | -------- | ------- | ---------------------------------------------------------------- |
| `health-url`      | no       | —       | URL polled after deployment. **The gate is skipped when empty.** |
| `health-timeout`  | no       | `180`   | Seconds to wait for a `200`.                                     |
| `health-interval` | no       | `5`     | Seconds between attempts.                                        |

---

## Outputs

| Output    | Description                                                      |
| --------- | ---------------------------------------------------------------- |
| `image`   | Fully qualified image reference, without a tag.                  |
| `tags`    | Newline-separated list of tags applied.                          |
| `digest`  | Image digest produced by the build.                              |
| `version` | Resolved version string.                                         |
| `healthy` | `true`, `false`, or `skipped` when no `health-url` was supplied. |

---

## Recipes

### Build only, on a pull request

```yaml
- uses: NadeeshaMedagama/StaySphere@v1
  with:
    service: auth-service
    image-namespace: ${{ github.repository_owner }}
    push: 'false'
```

No credentials are needed, and nothing leaves the runner. This is the safe shape
for `pull_request`, where the workflow runs against code that has not been
reviewed yet.

### Multi-architecture release to Docker Hub

```yaml
- uses: NadeeshaMedagama/StaySphere@v1
  with:
    service: booking-service
    version: ${{ github.event.release.tag_name }}
    registry: docker.io
    image-namespace: ${{ secrets.DOCKERHUB_USERNAME }}
    registry-username: ${{ secrets.DOCKERHUB_USERNAME }}
    registry-password: ${{ secrets.DOCKERHUB_TOKEN }}
    platforms: linux/amd64,linux/arm64
    extra-tags: |
      latest
      stable
```

### Deploy every service in a matrix

```yaml
jobs:
  deploy:
    strategy:
      matrix:
        service: [api-gateway, auth-service, booking-service]
    permissions:
      contents: read
      packages: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: NadeeshaMedagama/StaySphere@v1
        with:
          service: ${{ matrix.service }}
          image-namespace: ${{ github.repository_owner }}
          registry-username: ${{ github.actor }}
          registry-password: ${{ secrets.GITHUB_TOKEN }}
          deploy-webhook: ${{ secrets.DEPLOY_WEBHOOK }}
          health-url: https://api.example.com/health
          health-timeout: '300'
```

### Gate a later step on the health result

```yaml
- id: rollout
  uses: NadeeshaMedagama/StaySphere@v1
  with:
    service: booking-service
    image-namespace: ${{ github.repository_owner }}
    health-url: https://api.example.com/health

- name: Announce
  if: steps.rollout.outputs.healthy == 'true'
  run: echo "Shipped ${{ steps.rollout.outputs.digest }}"
```

---

## Required permissions

```yaml
permissions:
  contents: read
  packages: write # only when pushing to GHCR
  id-token: write # only when the caller also signs or attests
```

---

## Notes and limits

- **`push: 'false'` with several platforms cannot load the image locally.**
  Buildx can only `--load` a single-platform build, so a multi-platform build
  without a push produces no local image. Keep `platforms: linux/amd64` when
  building for verification only.
- **The health gate runs even when the build fails**, so a failed deploy is
  reported against the endpoint rather than silently skipped. It is the last
  signal in the step summary.
- **SBOM and provenance are attached only when pushing** — there is no artefact
  to attach them to otherwise.
- **The webhook is retried three times** with a five-second delay before the step
  fails, which absorbs a restarting deployment controller.

---

## Versioning

Releases follow semantic versioning, and the major tag moves with each release:

```yaml
- uses: NadeeshaMedagama/StaySphere@v1 # tracks the latest v1.x.y
- uses: NadeeshaMedagama/StaySphere@v1.2.3 # pinned exactly
```

Pin the exact version when reproducibility matters more than automatic fixes.
