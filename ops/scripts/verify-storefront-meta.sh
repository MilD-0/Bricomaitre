#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

# shellcheck source=load-infra-env.sh
source "$script_dir/load-infra-env.sh"

env_dir="${BRIC_ENV_DIR:-/srv/bric/env}"

load_optional_env_file() {
  local env_file="${1:?env file path is required}"

  if [[ ! -f "$env_file" ]]; then
    return 0
  fi

  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
}

load_optional_env_file "$env_dir/storefront.env"
load_optional_env_file "$env_dir/storefront-api.env"

slot="${1:-}"
storefront_domain="${BRIC_STOREFRONT_APEX_DOMAIN:-${BRIC_STOREFRONT_DOMAIN:-www.example.com}}"
meta_verify_enabled="${META_DEPLOY_VERIFY_ENABLED:-1}"
meta_test_event_code="${META_TEST_EVENT_CODE:-}"
deploy_token="${STOREFRONT_API_DEPLOY_TOKEN:-}"
meta_service_base="${STOREFRONT_META_VERIFY_SERVICE:-storefront-api}"
meta_service_port="${STOREFRONT_META_VERIFY_PORT:-3001}"

append_meta_summary() {
  local line="${1:?summary line is required}"

  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    printf '%s\n' "$line" >>"$GITHUB_STEP_SUMMARY"
  fi
}

if [[ "$meta_verify_enabled" == "0" ]]; then
  echo "meta verification skipped because META_DEPLOY_VERIFY_ENABLED=0"
  append_meta_summary "### Meta verification"
  append_meta_summary "- Skipped because \`META_DEPLOY_VERIFY_ENABLED=0\`"
  exit 0
fi

if [[ -z "$meta_test_event_code" ]]; then
  echo "META_TEST_EVENT_CODE is required for storefront Meta deploy verification; set it in $env_dir/storefront-api.env or $env_dir/storefront.env" >&2
  append_meta_summary "### Meta verification"
  append_meta_summary "- ❌ Missing \`META_TEST_EVENT_CODE\`"
  exit 1
fi

if [[ -z "$deploy_token" ]]; then
  echo "STOREFRONT_API_DEPLOY_TOKEN is required for Meta deploy verification; set it in $env_dir/storefront-api.env" >&2
  exit 1
fi

if [[ -n "${STOREFRONT_META_VERIFY_BASE_URL:-}" ]]; then
  base_url="${STOREFRONT_META_VERIFY_BASE_URL%/}"
else
  if [[ -z "$slot" ]]; then
    echo "slot is required when STOREFRONT_META_VERIFY_BASE_URL is not set" >&2
    exit 1
  fi

  # shellcheck source=blue-green.sh
  source "$script_dir/blue-green.sh"
  require_slot "$slot"

  service="$(service_name "$meta_service_base" "$slot")"
  container_id="$(compose ps -q "$service")"
  if [[ -z "$container_id" ]]; then
    echo "could not resolve candidate storefront container for slot $slot" >&2
    exit 1
  fi

  container_ip="$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$container_id")"
  if [[ -z "$container_ip" ]]; then
    echo "could not resolve candidate storefront IP for slot $slot" >&2
    exit 1
  fi

  base_url="http://${container_ip}:${meta_service_port}"
fi

python3 - "$base_url" "$storefront_domain" "$deploy_token" <<'PY'
import json
import sys
import time
import urllib.error
import urllib.request
import uuid

base_url = sys.argv[1].rstrip("/")
storefront_domain = sys.argv[2]
deploy_token = sys.argv[3]

event_id = f"deploy-meta-{uuid.uuid4()}"
payload = {
    "eventId": event_id,
    "eventSourceUrl": f"https://{storefront_domain}/?meta_deploy_verification=1",
}

request = urllib.request.Request(
    f"{base_url}/internal/meta/verify",
    data=json.dumps(payload).encode(),
    headers={
        "Authorization": f"Bearer {deploy_token}",
        "Content-Type": "application/json",
        "Host": storefront_domain,
        "X-Real-IP": "127.0.0.1",
        "User-Agent": "BricMetaDeployVerification/1.0",
    },
    method="POST",
)

try:
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read().decode()
        parsed = json.loads(body)
        events_received = parsed.get("eventsReceived") if isinstance(parsed, dict) else None
        fbtrace_id = parsed.get("fbtraceId") if isinstance(parsed, dict) else ""

        print(f"Meta verification event id: {event_id}")
        print(f"Meta verification HTTP status: {response.status}")
        if fbtrace_id:
            print(f"Meta verification fbtrace_id: {fbtrace_id}")

        if not isinstance(parsed, dict) or not parsed.get("ok") or not isinstance(events_received, int) or events_received < 1:
            print("Meta verification response body:", body, file=sys.stderr)
            raise SystemExit(1)
except urllib.error.HTTPError as error:
    body = error.read().decode()
    print(f"Meta verification event id: {event_id}")
    print(f"Meta verification HTTP status: {error.code}")
    print("Meta verification error body:", body, file=sys.stderr)
    raise SystemExit(1)
except Exception as error:
    print(f"Meta verification event id: {event_id}")
    print(f"Meta verification failure: {error}", file=sys.stderr)
    raise SystemExit(1)
PY

append_meta_summary "### Meta verification"
append_meta_summary "- ✅ Candidate slot ${slot:-custom} accepted a Meta CAPI verification event"
