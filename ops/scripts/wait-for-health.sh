#!/usr/bin/env bash
set -euo pipefail

service_name="${1:?compose service name is required}"
compose_file="${COMPOSE_FILE:-ops/docker/compose.prod.yml}"
attempts="${ATTEMPTS:-30}"
sleep_seconds="${SLEEP_SECONDS:-2}"

container_id="$(docker compose -f "$compose_file" ps -q "$service_name")"

if [[ -z "$container_id" ]]; then
  echo "service has no running container: $service_name" >&2
  exit 1
fi

for ((i=1; i<=attempts; i++)); do
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"

  if [[ "$status" == "healthy" || "$status" == "running" ]]; then
    echo "$service_name is healthy"
    exit 0
  fi

  echo "waiting for $service_name health ($i/$attempts): $status"
  sleep "$sleep_seconds"
done

echo "$service_name did not become healthy" >&2
exit 1
