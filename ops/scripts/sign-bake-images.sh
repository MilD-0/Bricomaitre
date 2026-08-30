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

max_attempts="${BRIC_SIGN_MAX_ATTEMPTS:-3}"
retry_delay_seconds="${BRIC_SIGN_RETRY_DELAY_SECONDS:-5}"
transient_pattern='i/o timeout|TLS handshake timeout|connection reset by peer|unexpected EOF|unexpected eof|temporary failure in name resolution|dial tcp|network is unreachable|context deadline exceeded|DeadlineExceeded|net/http: request canceled|502 Bad Gateway|503 Service Unavailable|504 Gateway Timeout|tuf refresh failed'

if [[ ! "$max_attempts" =~ ^[1-9][0-9]*$ ]]; then
  echo 'BRIC_SIGN_MAX_ATTEMPTS must be a positive integer' >&2
  exit 64
fi
if [[ ! "$retry_delay_seconds" =~ ^[0-9]+$ ]]; then
  echo 'BRIC_SIGN_RETRY_DELAY_SECONDS must be a non-negative integer' >&2
  exit 64
fi

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
  signed=false
  for attempt in $(seq 1 "$max_attempts"); do
    oidc_token="$(
      curl --fail-with-body --silent --show-error \
        --retry 3 \
        --retry-all-errors \
        --retry-delay 2 \
        --retry-max-time 60 \
        -H "Authorization: Bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" \
        "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=sigstore" \
        | node -e 'let data = ""; process.stdin.on("data", chunk => data += chunk); process.stdin.on("end", () => { const parsed = JSON.parse(data); if (!parsed.value) throw new Error("GitHub OIDC response did not include a token"); process.stdout.write(parsed.value); });'
    )"

    if sign_output="$(cosign sign --yes --identity-token "$oidc_token" "$digest_ref" 2>&1)"; then
      printf '%s\n' "$sign_output"
      signed=true
      break
    else
      sign_status=$?
    fi
    printf '%s\n' "$sign_output" >&2

    if ! grep -Eiq "$transient_pattern" <<<"$sign_output"; then
      echo "Signing ${image_name} failed with a non-network error; not retrying." >&2
      exit "$sign_status"
    fi
    if ((attempt == max_attempts)); then
      echo "Signing ${image_name} exhausted $max_attempts transient-network attempts." >&2
      exit "$sign_status"
    fi

    delay="$((retry_delay_seconds * attempt))"
    echo "Signing ${image_name} hit a transient network error; retrying ($attempt/$max_attempts) in ${delay}s." >&2
    sleep "$delay"
  done
  [[ "$signed" == true ]]
  echo "::endgroup::"

  printf '%s=%s\n' "$env_key" "$digest_ref" >>"$output_file"
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    echo "- ${image_name}: \`${digest_ref}\`" >>"$GITHUB_STEP_SUMMARY"
  fi
done
