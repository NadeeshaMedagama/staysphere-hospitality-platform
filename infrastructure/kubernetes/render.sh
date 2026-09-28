#!/usr/bin/env bash
# Renders the per-service manifests from the shared template.
#
#   ./render.sh <owner> <tag> [output-dir]
#
# One template substituted per service, rather than fifteen near-identical
# files that drift apart the first time somebody edits only the one they were
# looking at.
set -euo pipefail

OWNER="${1:?usage: render.sh <owner> <tag> [output-dir]}"
TAG="${2:?usage: render.sh <owner> <tag> [output-dir]}"
OUT="${3:-rendered}"

SERVICES=(
  api-gateway auth-service booking-service hotel-service room-service
  pricing-service payment-service stay-service finance-service
  housekeeping-service maintenance-service notification-service
  review-service reporting-service audit-service
)

# Services that own a Prisma schema and therefore need a migration Job.
MIGRATING=(
  auth-service booking-service hotel-service room-service pricing-service
  payment-service stay-service finance-service housekeeping-service
  maintenance-service notification-service review-service reporting-service
  audit-service
)

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$OUT"

render() {
  sed -e "s|SERVICE_NAME|$1|g" -e "s|IMAGE_TAG|$TAG|g" -e "s|OWNER|$OWNER|g" "$2"
}

for service in "${SERVICES[@]}"; do
  render "$service" "$script_dir/base/service-template.yaml" > "$OUT/${service}.yaml"
done

for service in "${MIGRATING[@]}"; do
  render "$service" "$script_dir/base/migration-job.yaml" > "$OUT/migrate-${service}.yaml"
done

echo "Rendered ${#SERVICES[@]} services and ${#MIGRATING[@]} migration jobs into $OUT/"
echo
echo "Apply with:"
echo "  kubectl apply -k $script_dir/overlays/production"
echo "  kubectl apply -f $OUT/            # migrations first, then services"
