# Kubernetes

How StaySphere runs on a cluster, and why the manifests are shaped the way they are.

---

## Layout

```
infrastructure/kubernetes/
├── base/
│   ├── namespace.yaml           Namespace with the restricted Pod Security Standard
│   ├── configmap.yaml           Non-secret configuration and in-cluster service URLs
│   ├── secret.example.yaml      Template only — never applied, never real
│   ├── service-template.yaml    Deployment + Service + PDB + HPA for one service
│   ├── migration-job.yaml       Prisma `migrate deploy`, one Job per service
│   ├── network-policy.yaml      Default deny, then exactly what is needed
│   ├── ingress.yaml             The single public entry point
│   └── kustomization.yaml
├── overlays/
│   ├── staging/
│   └── production/
└── render.sh                    Substitutes the template per service
```

---

## Deploying

```bash
# 1. Shared resources: namespace, config, policies, ingress.
kubectl apply -k infrastructure/kubernetes/overlays/production

# 2. Secrets, from your secret manager — never from a committed file.
kubectl create secret generic staysphere-secrets \
  --namespace staysphere \
  --from-literal=JWT_ACCESS_SECRET="$(openssl rand -base64 48)" \
  --from-literal=JWT_REFRESH_SECRET="$(openssl rand -base64 48)" \
  --from-literal=DATABASE_URL="$NEON_POOLED_URL" \
  --from-literal=DIRECT_URL="$NEON_DIRECT_URL"

# 3. Render the per-service manifests for a specific image tag.
./infrastructure/kubernetes/render.sh NadeeshaMedagama v1.2.0 rendered

# 4. Migrations first, then the services.
kubectl apply -f rendered/migrate-*.yaml
kubectl wait --for=condition=complete job -l app.kubernetes.io/component=migration \
  --namespace staysphere --timeout=300s
kubectl apply -f rendered/
```

---

## The decisions worth knowing

**One template, fifteen services.** Every service is identical in deployment
shape — same probes, same security context, same resource envelope. Fifteen
near-identical files would drift apart the first time somebody edited only the
one they happened to be looking at. `render.sh` substitutes the name and tag.

**Migrations are a Job, not an init container.** An init container runs once per
replica, so three replicas mean three concurrent `prisma migrate deploy`
invocations contending on the same advisory lock. One Job, once, then the
Deployment updates.

**Migrations use the direct endpoint.** Neon's pooler does not forward the
advisory locks Prisma Migrate takes, so the Job overrides `DATABASE_URL` with
`DIRECT_URL`. The running service keeps the pooled connection.

**Liveness and readiness are genuinely different probes.** `/health` never
touches a dependency; `/ready` does. Conflating them means a brief database blip
gets healthy pods killed, turning a degradation into an outage.

**`maxUnavailable: 0`.** A rollout adds a pod before removing one, so capacity
never dips below the replica count while traffic is live.

**Memory is limited, CPU is not.** A memory limit protects the node from a leak.
A CPU limit throttles a Node process during exactly the burst it needs to absorb,
adding latency without protecting anything the request has already reserved.

**Default-deny network policy.** Without it, a compromised notification service
can open a socket to the auth database. The policy is what makes
"database per service" an enforced boundary rather than a naming convention.

**No Secret manifest is committed.** `secret.example.yaml` is a template and CI
fails if any other file declares `kind: Secret`. Base64 is an encoding, not
encryption, and a committed Secret is a credential in git history forever.

---

## Verification

CI renders every manifest and validates it against the real Kubernetes API
schemas with `kubeconform`, plus both overlays through `kustomize build`. To run
the same checks locally:

```bash
brew install kubeconform
./infrastructure/kubernetes/render.sh NadeeshaMedagama v0.0.0 rendered
kubeconform -strict -summary -kubernetes-version 1.31.0 rendered/
kubectl kustomize infrastructure/kubernetes/overlays/production \
  | kubeconform -strict -summary -kubernetes-version 1.31.0 -
```

---

## What is deliberately not here

**A service mesh.** mTLS between services and traffic shifting are real
benefits, but a mesh is a substantial operational commitment. Network policy and
the gateway's circuit breakers cover the current threat and failure model.

**Kafka and Redis manifests.** Both are run as managed services in every
environment above local. Operating a stateful Kafka cluster on Kubernetes is a
project in itself and not one this platform needs to take on.

**GitOps.** `deploy-production.yml` applies directly. Argo CD or Flux becomes
worthwhile once there is more than one cluster to keep in sync.
