#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "$script_dir/../.." && pwd -P)"

# shellcheck source=load-infra-env.sh
source "$script_dir/load-infra-env.sh"

compose_file="${COMPOSE_FILE:-$repo_root/ops/docker/compose.prod.yml}"
runtime_dir="${BRIC_RUNTIME_DIR:-/srv/bric/runtime}"
state_file="${BRIC_DEPLOY_STATE_FILE:-$runtime_dir/blue-green.env}"
image_state_file="${BRIC_IMAGE_STATE_FILE:-$runtime_dir/images.env}"
deploy_lock_file="${BRIC_DEPLOY_LOCK_FILE:-$runtime_dir/deploy.lock}"
nginx_conf_dir="${BRIC_NGINX_CONF_DIR:-$runtime_dir/nginx}"
nginx_conf_file="${BRIC_NGINX_CONF_FILE:-$nginx_conf_dir/default.conf}"
nginx_template_file="${BRIC_NGINX_TEMPLATE_FILE:-$repo_root/ops/nginx/templates/default.conf.template}"
nginx_main_conf_dir="${BRIC_NGINX_MAIN_CONF_DIR:-$runtime_dir/nginx-main}"
nginx_main_conf_file="${BRIC_NGINX_MAIN_CONF_FILE:-$nginx_main_conf_dir/nginx.conf}"
nginx_main_source_file="${BRIC_NGINX_MAIN_SOURCE_FILE:-$repo_root/ops/nginx/nginx.conf}"
certbot_webroot_dir="${BRIC_CERTBOT_WEBROOT_DIR:-$runtime_dir/certbot-webroot}"
default_slot="${BRIC_DEFAULT_ACTIVE_SLOT:-blue}"
releases_dir="${BRIC_RELEASES_DIR:-/srv/bric/releases}"
current_link="${BRIC_CURRENT_LINK:-/srv/bric/current}"
previous_link="${BRIC_PREVIOUS_LINK:-/srv/bric/previous}"
release_marker_name="${BRIC_RELEASE_MARKER_NAME:-.bric-release.env}"
release_images_marker_name="${BRIC_RELEASE_IMAGES_MARKER_NAME:-.bric-images.env}"
release_keep_count="${BRIC_RELEASE_KEEP_COUNT:-5}"
runtime_env_dir="${BRIC_ENV_DIR:-/srv/bric/env}"
runtime_env_transaction_dir="$runtime_dir/env.rollback"
image_ref_regex="${BRIC_IMAGE_REF_REGEX:-}"
if [[ -z "$image_ref_regex" ]]; then
  image_ref_regex='^ghcr[.]io/mild-0/bricomaitre/[a-z0-9-]+@sha256:[a-f0-9]{64}$'
fi
legacy_image_ref_regex="${BRIC_LEGACY_IMAGE_REF_REGEX:-}"
if [[ -z "$legacy_image_ref_regex" ]]; then
  legacy_image_ref_regex='^ghcr[.]io/mild-0/bricomaitre2/[a-z0-9-]+@sha256:[a-f0-9]{64}$'
fi
cosign_certificate_identity="${BRIC_COSIGN_CERTIFICATE_IDENTITY:-https://github.com/MilD-0/Bricomaitre/.github/workflows/deploy.yml@refs/heads/main}"
legacy_cosign_certificate_identity="${BRIC_LEGACY_COSIGN_CERTIFICATE_IDENTITY:-https://github.com/MilD-0/Bricomaitre2/.github/workflows/deploy.yml@refs/heads/main}"
cosign_oidc_issuer="${BRIC_COSIGN_OIDC_ISSUER:-https://token.actions.githubusercontent.com}"
verified_release_layout=""
verified_release_image_profile=""


# shellcheck source=blue-green/runtime.sh
source "$script_dir/blue-green/runtime.sh"

# shellcheck source=blue-green/nginx.sh
source "$script_dir/blue-green/nginx.sh"

# shellcheck source=blue-green/release.sh
source "$script_dir/blue-green/release.sh"

# shellcheck source=blue-green/transactions.sh
source "$script_dir/blue-green/transactions.sh"
