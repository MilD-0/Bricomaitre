#!/usr/bin/env bash
set -euo pipefail

metadata_file="${1:-}"
output_file="${2:-}"
shift 2 2>/dev/null || true

if [[ -z "$metadata_file" || -z "$output_file" || "$#" -eq 0 ]]; then
  echo "Usage: sign-bake-images.sh <metadata-file> <output-file> <ENV_KEY:image-name:bake-target>..." >&2
  exit 2
fi

: "${IMAGE_NAMESPACE:?IMAGE_NAMESPACE is required}"
: "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:?GitHub OIDC request token is required}"
: "${ACTIONS_ID_TOKEN_REQUEST_URL:?GitHub OIDC request URL is required}"

mkdir -p "$(dirname "$output_file")"
: >"$output_file"

for image_spec in "$@"; do
  IFS=: read -r env_key image_name bake_target extra <<<"$image_spec"
  if [[ -z "$env_key" || -z "$image_name" || -z "$bake_target" || -n "${extra:-}" ]]; then
    echo "invalid image spec: $image_spec" >&2
    exit 2
  fi
  if [[ ! "$env_key" =~ ^BRIC_IMAGE_[A-Z0-9_]+$ || ! "$image_name" =~ ^[a-z0-9-]+$ ]]; then
    echo "invalid release image mapping: $image_spec" >&2
    exit 2
  fi

  digest="$(node ops/scripts/read-buildx-digest.mjs "$metadata_file" "$bake_target")"
  digest_ref="${IMAGE_NAMESPACE}/${image_name}@${digest}"

  echo "::group::Sign ${image_name}"
  oidc_token="$(
    curl --fail-with-body --silent --show-error \
      -H "Authorization: Bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" \
      "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=sigstore" \
      | node -e 'let data = ""; process.stdin.on("data", chunk => data += chunk); process.stdin.on("end", () => { const parsed = JSON.parse(data); if (!parsed.value) throw new Error("GitHub OIDC response did not include a token"); process.stdout.write(parsed.value); });'
  )"
  cosign sign --yes --identity-token "$oidc_token" "$digest_ref"
  echo "::endgroup::"

  printf '%s=%s\n' "$env_key" "$digest_ref" >>"$output_file"
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    echo "- ${image_name}: \`${digest_ref}\`" >>"$GITHUB_STEP_SUMMARY"
  fi
done
