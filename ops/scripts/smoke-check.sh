#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/load-infra-env.sh"

proxy_url="${BRIC_PROXY_URL:-https://127.0.0.1}"
admin_domain="${BRIC_ADMIN_DOMAIN:-admin.example.com}"
api_domain="${BRIC_API_DOMAIN:-api.example.com}"
storefront_domain="${BRIC_STOREFRONT_DOMAIN:-www.example.com}"

request() {
  local domain="${1:?domain is required}"
  local path="${2:?path is required}"

  curl \
    --fail \
    --silent \
    --show-error \
    --insecure \
    --max-time "${BRIC_SMOKE_TIMEOUT_SECONDS:-20}" \
    --header "Host: $domain" \
    "${proxy_url%/}${path}"
}

request "$admin_domain" "/api/health" >/dev/null
request "$api_domain" "/api/health" >/dev/null

storefront_health="$(request "$storefront_domain" "/api/health")"
if [[ ! "$storefront_health" =~ \"app\"[[:space:]]*:[[:space:]]*\"storefront-new\" ]]; then
  echo "storefront health did not identify storefront-new" >&2
  exit 1
fi

# Release-surface checks cover both locales, catalog, checkout, and the public
# crawl contract. They intentionally avoid order and analytics mutations.
fr_home="$(request "$storefront_domain" "/fr")"
ar_home="$(request "$storefront_domain" "/ar")"
robots="$(request "$storefront_domain" "/robots.txt")"
sitemap="$(request "$storefront_domain" "/sitemap.xml")"

grep -qi "Bricomaitre" <<<"$fr_home"
grep -qi "Bricomaitre" <<<"$ar_home"
request "$storefront_domain" "/fr/products" >/dev/null
request "$storefront_domain" "/fr/checkout" >/dev/null
grep -qi "sitemap" <<<"$robots"
grep -q "/fr/products/" <<<"$sitemap"

echo "smoke checks passed"
