#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=load-infra-env.sh
source "$(dirname "$0")/load-infra-env.sh"

proxy_url="${BRIC_PROXY_URL:-https://127.0.0.1}"
admin_domain="${BRIC_ADMIN_DOMAIN:-admin.example.com}"
api_domain="${BRIC_API_DOMAIN:-api.example.com}"
storefront_domain="${BRIC_STOREFRONT_DOMAIN:-www.example.com}"

if [[ "$proxy_url" =~ ^(https?)://([^/:]+)(:([0-9]+))?/?$ ]]; then
  proxy_scheme="${BASH_REMATCH[1]}"
  proxy_host="${BASH_REMATCH[2]}"
  proxy_port="${BASH_REMATCH[4]:-}"
else
  echo "BRIC_PROXY_URL must be an HTTP(S) origin without a path" >&2
  exit 1
fi

if [[ -z "$proxy_port" ]]; then
  if [[ "$proxy_scheme" == "https" ]]; then
    proxy_port=443
  else
    proxy_port=80
  fi
fi

request() {
  local domain="${1:?domain is required}"
  local path="${2:?path is required}"

  curl \
    --fail \
    --silent \
    --show-error \
    --noproxy "*" \
    --max-time "${BRIC_SMOKE_TIMEOUT_SECONDS:-20}" \
    --connect-to "$domain:$proxy_port:$proxy_host:$proxy_port" \
    --header "Host: $domain" \
    "$proxy_scheme://$domain:$proxy_port$path"
}

response_headers() {
  local domain="${1:?domain is required}"
  local path="${2:?path is required}"

  curl \
    --silent \
    --show-error \
    --noproxy "*" \
    --max-time "${BRIC_SMOKE_TIMEOUT_SECONDS:-20}" \
    --connect-to "$domain:$proxy_port:$proxy_host:$proxy_port" \
    --header "Host: $domain" \
    --dump-header - \
    --output /dev/null \
    "$proxy_scheme://$domain:$proxy_port$path"
}

require_single_request_id() {
  local domain="${1:?domain is required}"
  local path="${2:?path is required}"
  local attempts="${BRIC_SMOKE_REQUEST_ID_ATTEMPTS:-5}"
  local retry_delay="${BRIC_SMOKE_RETRY_DELAY_SECONDS:-0.5}"
  local count=0

  for ((attempt=1; attempt<=attempts; attempt++)); do
    count="$(response_headers "$domain" "$path" | tr -d '\r' | awk '
      tolower($1) == "x-request-id:" { count += 1 }
      END { print count + 0 }
    ')"
    if [[ "$count" == "1" ]]; then
      return 0
    fi

    if (( attempt < attempts )); then
      sleep "$retry_delay"
    fi
  done

  echo "$domain $path returned $count x-request-id headers after $attempts attempts; expected exactly 1" >&2
  return 1
}

request "$admin_domain" "/api/health" >/dev/null
request "$api_domain" "/api/health" >/dev/null
require_single_request_id "$admin_domain" "/api/health"
require_single_request_id "$api_domain" "/api/health"
require_single_request_id "$storefront_domain" "/api/health"

storefront_health="$(request "$storefront_domain" "/api/health")"
if [[ ! "$storefront_health" =~ \"app\"[[:space:]]*:[[:space:]]*\"storefront\" ]]; then
  echo "storefront health did not identify storefront" >&2
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
