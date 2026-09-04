#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
workspace_root="$(cd -- "$script_dir/../.." && pwd)"
audit_dir="$(mktemp -d "${TMPDIR:-/tmp}/bric-dependency-audit.XXXXXX")"
licenses_json="$audit_dir/production-licenses.json"
sbom_json="$audit_dir/production.cdx.json"
results_json="$audit_dir/osv-results.json"

cleanup() {
  for audit_file in "$licenses_json" "$sbom_json" "$results_json"; do
    if [[ -e "$audit_file" ]]; then
      unlink "$audit_file"
    fi
  done
  if [[ -d "$audit_dir" ]]; then
    rmdir "$audit_dir"
  fi
}
trap cleanup EXIT

cd "$workspace_root"

# pnpm resolves the production graph from the installed workspace. Converting
# that graph to CycloneDX keeps dev-only packages out of the advisory query.
pnpm licenses list --prod --json >"$licenses_json"
node ops/scripts/production-dependency-audit.mjs generate "$licenses_json" "$sbom_json"

osv_bin="$(bash ops/scripts/install-osv-scanner.sh)"
if "$osv_bin" scan source \
  --lockfile="$sbom_json" \
  --format=json \
  --output-file="$results_json" \
  --verbosity=warn; then
  scan_status=0
else
  scan_status=$?
fi

# OSV-Scanner returns 1 when it found advisories. Other statuses mean it could
# not produce a trustworthy result, so the gate remains fail-closed.
if ((scan_status != 0 && scan_status != 1)); then
  echo "OSV-Scanner failed before producing an advisory result (status $scan_status)." >&2
  exit "$scan_status"
fi

node ops/scripts/production-dependency-audit.mjs evaluate "$results_json" "$sbom_json"
