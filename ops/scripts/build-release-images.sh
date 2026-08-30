#!/usr/bin/env bash
set -euo pipefail

if (($# != 3)); then
  echo 'Usage: build-release-images.sh <api|admin|storefront> <metadata-file> <log-file>' >&2
  exit 64
fi

build_group="$1"
metadata_file="$2"
log_file="$3"
max_attempts="${BRIC_BUILD_MAX_ATTEMPTS:-3}"
retry_delay_seconds="${BRIC_BUILD_RETRY_DELAY_SECONDS:-5}"

case "$build_group" in
  api | admin | storefront) ;;
  *)
    echo "Unsupported release image group: $build_group" >&2
    exit 64
    ;;
esac

if [[ ! "$max_attempts" =~ ^[1-9][0-9]*$ ]]; then
  echo 'BRIC_BUILD_MAX_ATTEMPTS must be a positive integer' >&2
  exit 64
fi
if [[ ! "$retry_delay_seconds" =~ ^[0-9]+$ ]]; then
  echo 'BRIC_BUILD_RETRY_DELAY_SECONDS must be a non-negative integer' >&2
  exit 64
fi

mkdir -p "$(dirname "$metadata_file")" "$(dirname "$log_file")"

transient_pattern='i/o timeout|TLS handshake timeout|connection reset by peer|unexpected EOF|unexpected eof|temporary failure in name resolution|dial tcp|network is unreachable|context deadline exceeded|DeadlineExceeded|net/http: request canceled|502 Bad Gateway|503 Service Unavailable|504 Gateway Timeout'

for attempt in $(seq 1 "$max_attempts"); do
  if [[ -e "$metadata_file" ]]; then
    unlink "$metadata_file"
  fi

  if docker buildx bake \
    --file ops/docker/docker-bake.hcl \
    --push --provenance=true --sbom=true --progress plain \
    --metadata-file "$metadata_file" \
    "$build_group" 2>&1 | tee "$log_file"; then
    exit 0
  fi

  if ! grep -Eiq "$transient_pattern" "$log_file"; then
    echo "Release image build failed with a non-network error; not retrying." >&2
    exit 1
  fi
  if ((attempt == max_attempts)); then
    echo "Release image build exhausted $max_attempts transient-network attempts." >&2
    exit 1
  fi

  delay="$((retry_delay_seconds * attempt))"
  echo "Release image build hit a transient network error; retrying ($attempt/$max_attempts) in ${delay}s." >&2
  sleep "$delay"
done
