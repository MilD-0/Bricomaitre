#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 5 ]]; then
  echo 'usage: run-with-ci-services.sh <postgres-port> <redis-port> <database> <command> [args...]' >&2
  exit 64
fi

postgres_port="$1"
redis_port="$2"
database="$3"
shift 3

if [[ ! "$postgres_port" =~ ^[0-9]+$ ]] ||
  ((postgres_port < 1024 || postgres_port > 65535)); then
  echo "invalid PostgreSQL port: $postgres_port" >&2
  exit 64
fi
if [[ ! "$redis_port" =~ ^[0-9]+$ ]] || ((redis_port < 1024 || redis_port > 65535)); then
  echo "invalid Redis port: $redis_port" >&2
  exit 64
fi
if [[ ! "$database" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
  echo "invalid PostgreSQL database name: $database" >&2
  exit 64
fi

postgres_image='postgres:16-bookworm@sha256:bb3e1a57e5407e0a5280b4211980a5e537f4abd234a87014ac979849a78dd825'
redis_image='redis:7-bookworm@sha256:71da9275c5f3fcb97d0fa0c8c5b36cc995327265420f17a04bfd544f458059f7'
cache_root="${BRIC_CI_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/bricomaitre-ci}"
mkdir -p "$cache_root"

ensure_image() {
  local image="$1"
  local attempt

  if docker image inspect "$image" >/dev/null 2>&1; then
    return
  fi

  (
    flock 9
    if docker image inspect "$image" >/dev/null 2>&1; then
      exit 0
    fi

    for attempt in 1 2 3; do
      if docker pull "$image"; then
        exit 0
      fi
      if ((attempt < 3)); then
        echo "Container image pull failed; retrying ($attempt/3): $image" >&2
        sleep "$((attempt * 2))"
      fi
    done

    echo "Container image pull exhausted 3 attempts: $image" >&2
    exit 1
  ) 9>"$cache_root/docker-images.lock"
}

ensure_image "$postgres_image"
ensure_image "$redis_image"

port_is_available() {
  python3 - "$1" <<'PY'
import socket
import sys

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
try:
    sock.bind(("0.0.0.0", int(sys.argv[1])))
except OSError:
    raise SystemExit(1)
finally:
    sock.close()
PY
}

choose_available_port() {
  local preferred_port="$1"
  local offset
  local candidate

  for offset in $(seq 0 199); do
    candidate=$((preferred_port + offset))
    if ((candidate > 65535)); then
      break
    fi
    if port_is_available "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  echo "no available CI service port near $preferred_port" >&2
  return 1
}

# Every self-hosted runner shares the host network. Serialize allocation until
# both containers have bound their selected ports, then let their test jobs run
# concurrently on distinct listeners.
exec {service_port_lock_fd}>"$cache_root/service-ports.lock"
flock "$service_port_lock_fd"
postgres_port="$(choose_available_port "$postgres_port")"
redis_port="$(choose_available_port "$redis_port")"

run_token="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-${GITHUB_JOB:-job}-$$"
run_token="${run_token//[^a-zA-Z0-9_.-]/-}"
postgres_container="bricomaitre-ci-postgres-$run_token"
redis_container="bricomaitre-ci-redis-$run_token"
postgres_started='false'
redis_started='false'

cleanup() {
  local status=$?
  trap - EXIT INT TERM HUP
  if [[ "$redis_started" == 'true' ]]; then
    docker rm --force "$redis_container" >/dev/null 2>&1 || true
  fi
  if [[ "$postgres_started" == 'true' ]]; then
    docker rm --force "$postgres_container" >/dev/null 2>&1 || true
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

container_state() {
  docker inspect \
    --format 'running={{.State.Running}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} error={{.State.Error}}' \
    "$1" 2>/dev/null
}

report_stopped_container() {
  local container="$1"
  local service="$2"
  local state

  state="$(container_state "$container" || true)"
  echo "$service CI service stopped before becoming ready: ${state:-container missing}" >&2
  docker logs --tail 100 "$container" >&2 || true
}

wait_for_postgres() {
  local attempt
  for attempt in $(seq 1 30); do
    if [[ "$(container_state "$postgres_container" || true)" != running=true* ]]; then
      report_stopped_container "$postgres_container" 'PostgreSQL'
      return 1
    fi
    if docker exec "$postgres_container" \
      pg_isready -h 127.0.0.1 -p "$postgres_port" -U bricomaitre -d "$database" \
      >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done
  docker logs --tail 100 "$postgres_container" >&2 || true
  echo 'PostgreSQL CI service did not become ready.' >&2
  return 1
}

wait_for_redis() {
  local attempt
  for attempt in $(seq 1 30); do
    if [[ "$(container_state "$redis_container" || true)" != running=true* ]]; then
      report_stopped_container "$redis_container" 'Redis'
      return 1
    fi
    if [[ "$(docker exec "$redis_container" redis-cli -h 127.0.0.1 -p "$redis_port" ping 2>/dev/null)" == 'PONG' ]]; then
      return
    fi
    sleep 1
  done
  docker logs --tail 100 "$redis_container" >&2 || true
  echo 'Redis CI service did not become ready.' >&2
  return 1
}

docker run \
  --detach \
  --init \
  --network host \
  --name "$redis_container" \
  --label com.bricomaitre.ci-service=redis \
  "$redis_image" \
  redis-server --port "$redis_port" --save '' --appendonly no >/dev/null
redis_started='true'
wait_for_redis

docker run \
  --detach \
  --init \
  --network host \
  --name "$postgres_container" \
  --label com.bricomaitre.ci-service=postgres \
  --env POSTGRES_DB="$database" \
  --env POSTGRES_USER=bricomaitre \
  --env POSTGRES_PASSWORD=bricomaitre \
  "$postgres_image" \
  -c "port=$postgres_port" >/dev/null
postgres_started='true'
wait_for_postgres

flock -u "$service_port_lock_fd"

export DATABASE_URL="postgres://bricomaitre:bricomaitre@127.0.0.1:${postgres_port}/${database}"
export REDIS_URL="redis://127.0.0.1:${redis_port}/0"

export BRIC_CI_POSTGRES_CONTAINER="$postgres_container"
export BRIC_CI_POSTGRES_PORT="$postgres_port"
export BRIC_CI_REDIS_CONTAINER="$redis_container"
export BRIC_CI_REDIS_PORT="$redis_port"

"$@"
