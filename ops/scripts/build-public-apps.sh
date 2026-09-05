#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "$script_dir/../.." && pwd -P)"
cd "$repo_root"

# This is the deterministic source-verification build, not the official release
# build. Force every compiled public value and prevent local .env files from
# turning verification into a production dependency or a Sentry upload.
export BETTER_AUTH_SECRET='build-verification-secret-at-least-32-characters'
export BETTER_AUTH_URL='http://127.0.0.1:3000'
export GOOGLE_CLIENT_ID='build-verification-client'
export GOOGLE_CLIENT_SECRET='build-verification-secret'
fixture_origin='http://127.0.0.1:4311'
fixture_log="$(mktemp -t bric-build-fixture.XXXXXX.log)"
fixture_pid=''

cleanup() {
  if [[ -n "$fixture_pid" ]] && kill -0 "$fixture_pid" 2>/dev/null; then
    kill "$fixture_pid"
    wait "$fixture_pid" 2>/dev/null || true
  fi
  rm -f "$fixture_log"
}
trap cleanup EXIT

PORT='4311' \
  FIXTURE_API_ORIGIN="$fixture_origin" \
  STOREFRONT_ORIGIN='http://127.0.0.1:3003' \
  node apps/storefront/test/fixture-storefront-api.mjs >"$fixture_log" 2>&1 &
fixture_pid=$!

fixture_ready='false'
for _ in $(seq 1 50); do
  if ! kill -0 "$fixture_pid" 2>/dev/null; then
    break
  fi
  if curl --fail --silent "$fixture_origin/api/health" >/dev/null; then
    fixture_ready='true'
    break
  fi
  sleep 0.1
done
if [[ "$fixture_ready" != 'true' ]]; then
  cat "$fixture_log" >&2
  echo 'deterministic storefront build fixture did not become ready' >&2
  exit 1
fi

export STOREFRONT_API_BASE_URL="$fixture_origin"
export STOREFRONT_API_TIMEOUT_MS='1000'
export NEXT_PUBLIC_SITE_URL='http://127.0.0.1:3003'
export NEXT_PUBLIC_CLOUDFRONT_URL=''
export NEXT_PUBLIC_STOREFRONT_IMAGE_ORIGINS="http://127.0.0.1:3003,$fixture_origin"
export NEXT_PUBLIC_FACEBOOK_PIXEL_ID=''
export NEXT_PUBLIC_GA_MEASUREMENT_ID=''
export NEXT_PUBLIC_TIKTOK_PIXEL_ID=''
export NEXT_PUBLIC_SENTRY_DSN_ADMIN=''
export NEXT_PUBLIC_SENTRY_DSN_STOREFRONT=''
export NEXT_PUBLIC_RELEASE='source-verification'
export SENTRY_AUTH_TOKEN=''
export SENTRY_ORG=''
export SENTRY_PROJECT_ADMIN=''
export SENTRY_PROJECT_STOREFRONT_API=''
export SENTRY_PROJECT_STOREFRONT=''
export SENTRY_RELEASE='source-verification'
export NEXT_TELEMETRY_DISABLED='1'

case "${1:-all}" in
  all)
    pnpm build:apps
    ;;
  storefront)
    pnpm --filter @bric/storefront build
    ;;
  *)
    echo 'usage: build-public-apps.sh [all|storefront]' >&2
    exit 64
    ;;
esac
