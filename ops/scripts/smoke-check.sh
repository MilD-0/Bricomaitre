#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/load-infra-env.sh"

proxy_url="${BRIC_PROXY_URL:-http://127.0.0.1}"
admin_domain="${BRIC_ADMIN_DOMAIN:-admin.example.com}"
api_domain="${BRIC_API_DOMAIN:-api.example.com}"
storefront_domain="${BRIC_STOREFRONT_DOMAIN:-www.example.com}"

curl --fail --silent --show-error --header "Host: $admin_domain" "$proxy_url/api/health" >/dev/null
curl --fail --silent --show-error --header "Host: $api_domain" "$proxy_url/api/health" >/dev/null
curl --fail --silent --show-error --header "Host: $storefront_domain" "$proxy_url/api/health" >/dev/null
curl --fail --silent --show-error --header "Host: $storefront_domain" "$proxy_url/api/health?sf_variant=control" >/dev/null
curl --fail --silent --show-error --header "Host: $storefront_domain" "$proxy_url/api/health?sf_variant=fast_checkout" >/dev/null

echo "smoke checks passed"
