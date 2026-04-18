#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

source "$script_dir/load-infra-env.sh"

slot="${1:-}"
storefront_domain="${BRIC_STOREFRONT_APEX_DOMAIN:-${BRIC_STOREFRONT_DOMAIN:-www.example.com}}"
meta_verify_enabled="${META_DEPLOY_VERIFY_ENABLED:-1}"
meta_test_event_code="${META_TEST_EVENT_CODE:-}"

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
  echo "META_TEST_EVENT_CODE is required for storefront Meta deploy verification" >&2
  append_meta_summary "### Meta verification"
  append_meta_summary "- ❌ Missing \`META_TEST_EVENT_CODE\`"
  exit 1
fi

if [[ -n "${STOREFRONT_META_VERIFY_BASE_URL:-}" ]]; then
  base_url="${STOREFRONT_META_VERIFY_BASE_URL%/}"
else
  if [[ -z "$slot" ]]; then
    echo "slot is required when STOREFRONT_META_VERIFY_BASE_URL is not set" >&2
    exit 1
  fi

  source "$script_dir/blue-green.sh"
  require_slot "$slot"

  service="$(service_name storefront "$slot")"
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

  base_url="http://${container_ip}:3002"
fi

python3 - "$base_url" "$storefront_domain" "$meta_test_event_code" <<'PY'
import json
import sys
import time
import urllib.error
import urllib.request
import uuid

base_url = sys.argv[1].rstrip("/")
storefront_domain = sys.argv[2]
test_event_code = sys.argv[3]

event_id = f"deploy-meta-{uuid.uuid4()}"
payload = {
    "event_name": "PageView",
    "event_time": int(time.time()),
    "event_id": event_id,
    "user_data": {
        "client_user_agent": "BricMetaDeployVerification/1.0",
    },
    "custom_data": {
        "source": "deploy_verification",
    },
    "url": f"https://{storefront_domain}/?meta_deploy_verification=1",
    "test_event_code": test_event_code,
}

request = urllib.request.Request(
    f"{base_url}/api/capi",
    data=json.dumps(payload).encode(),
    headers={
        "Content-Type": "application/json",
        "Host": storefront_domain,
        "User-Agent": "BricMetaDeployVerification/1.0",
    },
    method="POST",
)

try:
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read().decode()
        parsed = json.loads(body)
        meta_data = parsed.get("data") if isinstance(parsed, dict) else None
        events_received = meta_data.get("events_received") if isinstance(meta_data, dict) else None
        fbtrace_id = meta_data.get("fbtrace_id") if isinstance(meta_data, dict) else ""

        print(f"Meta verification event id: {event_id}")
        print(f"Meta verification HTTP status: {response.status}")
        if fbtrace_id:
            print(f"Meta verification fbtrace_id: {fbtrace_id}")

        if not isinstance(parsed, dict) or not parsed.get("success") or not isinstance(events_received, int) or events_received < 1:
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
