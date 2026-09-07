# shellcheck shell=bash

verify_release_dir() {
  local release_dir="${1:?release dir is required}"
  local expected_commit="${2:-}"
  local marker_file="$release_dir/$release_marker_name"
  local images_marker_file="$release_dir/$release_images_marker_name"
  local common_required_files=(
    "$release_dir/ops/scripts/deploy.sh"
    "$release_dir/ops/docker/compose.prod.yml"
    "$release_dir/ops/nginx/nginx.conf"
    "$release_dir/ops/nginx/templates/default.conf.template"
    "$marker_file"
    "$images_marker_file"
  )
  local public_legal_files=(
    "$release_dir/LICENSE"
    "$release_dir/NOTICE"
    "$release_dir/third_party/licenses/GPL-3.0-only.txt"
    "$release_dir/third_party/licenses/LGPL-3.0-or-later.txt"
    "$release_dir/third_party/licenses/SHARP-LIBVIPS-THIRD-PARTY-NOTICES.md"
    "$release_dir/third_party/licenses/SHARP-LIBVIPS-VERSIONS.json"
  )
  # Retain one release-generation compatibility window so the first public
  # release can roll back to the immediately preceding bundle. New deployments
  # (which always supply expected_commit) must use the public legal layout.
  local legacy_legal_files=(
    "$release_dir/ops/ownership/AI_AGENT_BOUNDARY.md"
    "$release_dir/ops/ownership/BRICOMAITRE_AUTHORIZED_RELEASE.txt"
    "$release_dir/ops/ownership/AI_POLICY.md"
    "$release_dir/ops/ownership/LICENSE"
    "$release_dir/ops/ownership/NOTICE"
    "$release_dir/ops/ownership/SECURITY.md"
    "$release_dir/AGENTS.md"
    "$release_dir/LICENSE"
    "$release_dir/NOTICE"
    "$release_dir/SECURITY.md"
    "$release_dir/.well-known/ai-policy.md"
  )
  local file

  verified_release_layout=""
  verified_release_image_profile=""

  for file in "${common_required_files[@]}"; do
    if [[ ! -f "$file" ]]; then
      echo "release is missing required file: $file" >&2
      exit 1
    fi
  done

  release_has_all_files() {
    local candidate
    for candidate in "$@"; do
      [[ -f "$candidate" ]] || return 1
    done
  }

  if release_has_all_files "${public_legal_files[@]}"; then
    # Consumed by rollback.sh after this library returns.
    # shellcheck disable=SC2034
    verified_release_layout="public"
  elif [[ -z "$expected_commit" ]] && release_has_all_files "${legacy_legal_files[@]}"; then
    # Consumed by rollback.sh after this library returns.
    # shellcheck disable=SC2034
    verified_release_layout="legacy"
    echo 'warning: accepting a retained legacy release for rollback compatibility' >&2
  else
    echo 'release is missing the complete public legal/license surface' >&2
    exit 1
  fi

  set -a
  BRIC_RELEASE_SIGNER_IDENTITY=""
  # shellcheck disable=SC1090
  source "$marker_file"
  set +a

  if [[ -z "${BRIC_RELEASE_ID:-}" || -z "${BRIC_RELEASE_COMMIT:-}" ]]; then
    echo "release marker is incomplete: $marker_file" >&2
    exit 1
  fi

  if [[ -n "$expected_commit" && "${BRIC_RELEASE_COMMIT}" != "$expected_commit" ]]; then
    echo "release commit mismatch: expected $expected_commit but found ${BRIC_RELEASE_COMMIT}" >&2
    exit 1
  fi

  if [[ -n "$expected_commit" ]]; then
    if [[ "$BRIC_RELEASE_SIGNER_IDENTITY" != "$cosign_certificate_identity" ]]; then
      echo "release signer mismatch: expected ${cosign_certificate_identity}" >&2
      exit 1
    fi
    verified_release_image_profile="public"
  elif [[ "$verified_release_layout" == "legacy" ]]; then
    if [[ -n "$BRIC_RELEASE_SIGNER_IDENTITY" && "$BRIC_RELEASE_SIGNER_IDENTITY" != "$legacy_cosign_certificate_identity" ]]; then
      echo "legacy release signer is not trusted: ${BRIC_RELEASE_SIGNER_IDENTITY}" >&2
      exit 1
    fi
    verified_release_image_profile="legacy"
  elif [[ "$BRIC_RELEASE_SIGNER_IDENTITY" == "$cosign_certificate_identity" ]]; then
    verified_release_image_profile="public"
  elif [[ -z "$BRIC_RELEASE_SIGNER_IDENTITY" || "$BRIC_RELEASE_SIGNER_IDENTITY" == "$legacy_cosign_certificate_identity" ]]; then
    # rollback.sh consumes this global after sourcing this library.
    # shellcheck disable=SC2034
    verified_release_image_profile="legacy-public"
    echo 'warning: accepting a canonical release signed by the former repository for rollback compatibility' >&2
  else
    echo "release signer is not trusted: ${BRIC_RELEASE_SIGNER_IDENTITY}" >&2
    exit 1
  fi
}

slot_env_suffix() {
  local slot="${1:?slot is required}"
  require_slot "$slot"

  if [[ "$slot" == "blue" ]]; then
    printf 'BLUE\n'
  else
    printf 'GREEN\n'
  fi
}

verify_image_ref_format() {
  local image_ref="${1:?image ref is required}"
  local verification_profile="${2:-public}"
  local expected_regex="$image_ref_regex"

  if [[ "$verification_profile" == "legacy" ]]; then
    expected_regex="$legacy_image_ref_regex"
  elif [[ "$verification_profile" != "public" && "$verification_profile" != "legacy-public" ]]; then
    echo "invalid image verification profile: $verification_profile" >&2
    return 1
  fi

  if [[ ! "$image_ref" =~ $expected_regex ]]; then
    echo "invalid image ref; expected immutable GHCR digest ref: $image_ref" >&2
    return 1
  fi
}

verify_signed_image() {
  local image_ref="${1:?image ref is required}"
  local verification_profile="${2:-public}"
  local expected_identity="$cosign_certificate_identity"

  if [[ "$verification_profile" == "legacy" || "$verification_profile" == "legacy-public" ]]; then
    expected_identity="$legacy_cosign_certificate_identity"
  elif [[ "$verification_profile" != "public" ]]; then
    echo "invalid image verification profile: $verification_profile" >&2
    return 1
  fi

  if ! command -v cosign >/dev/null 2>&1; then
    echo "cosign is required on the VPS before registry-based deploys" >&2
    return 1
  fi

  cosign verify \
    --certificate-identity "$expected_identity" \
    --certificate-oidc-issuer "$cosign_oidc_issuer" \
    "$image_ref" >/dev/null
}

require_release_image_manifest() {
  local images_file="${1:?images manifest is required}"

  # shellcheck disable=SC1090
  source "$images_file"

  local required_vars=(
    BRIC_IMAGE_STOREFRONT_API
    BRIC_IMAGE_STOREFRONT_META_WORKER
    BRIC_IMAGE_ADMIN_WEB
    BRIC_IMAGE_ADMIN_WORKER
    BRIC_IMAGE_ADMIN_MIGRATIONS
    BRIC_IMAGE_STOREFRONT_WEB
    BRIC_STOREFRONT_APP
  )
  local var

  for var in "${required_vars[@]}"; do
    if [[ -z "${!var:-}" ]]; then
      echo "release image manifest is missing ${var}: ${images_file}" >&2
      return 1
    fi
  done

  if [[ "$BRIC_STOREFRONT_APP" != "storefront" ]]; then
    echo "BRIC_STOREFRONT_APP must identify storefront" >&2
    return 1
  fi
}

env_value_or_default() {
  local var_name="${1:?var name is required}"
  local default_value="${2:-}"

  printf '%s\n' "${!var_name:-$default_value}"
}

apply_release_images() {
  local target_slot="${1:?target slot is required}"
  local images_file="${2:?images manifest is required}"
  local verification_profile="${3:-public}"
  local slot_suffix
  local state_tmp

  require_slot "$target_slot"
  require_release_image_manifest "$images_file"

  if [[ "$verification_profile" != "public" && "$verification_profile" != "legacy-public" && "$verification_profile" != "legacy" ]]; then
    echo "invalid image verification profile: $verification_profile" >&2
    return 1
  fi

  local release_storefront_api="$BRIC_IMAGE_STOREFRONT_API"
  local release_storefront_meta_worker="$BRIC_IMAGE_STOREFRONT_META_WORKER"
  local release_admin_web="$BRIC_IMAGE_ADMIN_WEB"
  local release_admin_worker="$BRIC_IMAGE_ADMIN_WORKER"
  local release_admin_migrations="$BRIC_IMAGE_ADMIN_MIGRATIONS"
  local release_storefront_web="$BRIC_IMAGE_STOREFRONT_WEB"

  local image_refs=(
    "$release_storefront_api"
    "$release_storefront_meta_worker"
    "$release_admin_web"
    "$release_admin_worker"
    "$release_admin_migrations"
    "$release_storefront_web"
  )
  local image_ref

  for image_ref in "${image_refs[@]}"; do
    verify_image_ref_format "$image_ref" "$verification_profile"
    verify_signed_image "$image_ref" "$verification_profile"
    docker pull "$image_ref"
  done

  ensure_runtime_dirs

  if [[ -f "$image_state_file" ]]; then
    # shellcheck disable=SC1090
    source "$image_state_file"
  fi

  slot_suffix="$(slot_env_suffix "$target_slot")"
  state_tmp="$(mktemp "${image_state_file}.tmp.XXXXXX")"

  {
    for slot in BLUE GREEN; do
      if [[ "$slot" == "$slot_suffix" ]]; then
        printf 'BRIC_IMAGE_STOREFRONT_API_%s=%s\n' "$slot" "$release_storefront_api"
        printf 'BRIC_IMAGE_ADMIN_WEB_%s=%s\n' "$slot" "$release_admin_web"
        printf 'BRIC_IMAGE_ADMIN_WORKER_%s=%s\n' "$slot" "$release_admin_worker"
        printf 'BRIC_IMAGE_ADMIN_MIGRATIONS_%s=%s\n' "$slot" "$release_admin_migrations"
        printf 'BRIC_IMAGE_STOREFRONT_WEB_%s=%s\n' "$slot" "$release_storefront_web"
      else
        printf 'BRIC_IMAGE_STOREFRONT_API_%s=%s\n' "$slot" "$(env_value_or_default "BRIC_IMAGE_STOREFRONT_API_${slot}" "$release_storefront_api")"
        printf 'BRIC_IMAGE_ADMIN_WEB_%s=%s\n' "$slot" "$(env_value_or_default "BRIC_IMAGE_ADMIN_WEB_${slot}" "$release_admin_web")"
        printf 'BRIC_IMAGE_ADMIN_WORKER_%s=%s\n' "$slot" "$(env_value_or_default "BRIC_IMAGE_ADMIN_WORKER_${slot}" "$release_admin_worker")"
        printf 'BRIC_IMAGE_ADMIN_MIGRATIONS_%s=%s\n' "$slot" "$(env_value_or_default "BRIC_IMAGE_ADMIN_MIGRATIONS_${slot}" "$release_admin_migrations")"
        printf 'BRIC_IMAGE_STOREFRONT_WEB_%s=%s\n' "$slot" "$(env_value_or_default "BRIC_IMAGE_STOREFRONT_WEB_${slot}" "$release_storefront_web")"
      fi
    done

    printf 'BRIC_IMAGE_STOREFRONT_META_WORKER=%s\n' "$release_storefront_meta_worker"
  } >"$state_tmp"

  mv "$state_tmp" "$image_state_file"
}

image_state_snapshot=""
image_state_had_file=false
