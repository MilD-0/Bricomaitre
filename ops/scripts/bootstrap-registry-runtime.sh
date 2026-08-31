#!/usr/bin/env bash
set -euo pipefail

known_good_image="${1:-}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    return 1
  fi
}

require_command docker
require_command cosign

docker version >/dev/null
docker compose version >/dev/null
cosign version >/dev/null

if [[ -z "${GHCR_USERNAME:-}" || -z "${GHCR_READ_TOKEN:-}" ]]; then
  echo "GHCR_USERNAME and GHCR_READ_TOKEN are required for docker login" >&2
  exit 1
fi

printf '%s\n' "$GHCR_READ_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin

if [[ -n "$known_good_image" ]]; then
  cosign verify \
    --certificate-identity "${BRIC_COSIGN_CERTIFICATE_IDENTITY:-https://github.com/MilD-0/Bricomaitre/.github/workflows/deploy.yml@refs/heads/main}" \
    --certificate-oidc-issuer "${BRIC_COSIGN_OIDC_ISSUER:-https://token.actions.githubusercontent.com}" \
    "$known_good_image" >/dev/null
fi

echo "registry runtime bootstrap checks passed"
