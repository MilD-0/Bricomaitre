#!/usr/bin/env bash
set -euo pipefail

workspace_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
scan_mode="${1:-all}"
scan_source="${2:-$workspace_dir}"
gitleaks_config="$workspace_dir/.gitleaks.toml"
report_verifier="$workspace_dir/ops/scripts/verify-gitleaks-report.mjs"
leak_exit_code=23

case "$scan_mode" in
  worktree|history|all) ;;
  *)
    echo 'Usage: scan-secrets.sh [worktree|history|all] [repository]' >&2
    exit 64
    ;;
esac

if [[ ! -d "$scan_source/.git" ]] && ! git -C "$scan_source" rev-parse --git-dir >/dev/null 2>&1; then
  echo "Secret-scan source is not a Git repository: $scan_source" >&2
  exit 64
fi

if [[ -n "${BRIC_GITLEAKS_BIN:-}" ]]; then
  gitleaks_bin="$BRIC_GITLEAKS_BIN"
else
  gitleaks_bin="$(bash "$workspace_dir/ops/scripts/install-gitleaks.sh")"
fi

if [[ "$("$gitleaks_bin" version)" != '8.18.4' ]]; then
  echo 'Secret scanning requires the checksum-pinned Gitleaks 8.18.4 binary.' >&2
  exit 1
fi

scan_dir="$(mktemp -d)"
cleanup() {
  rm -rf -- "$scan_dir"
}
trap cleanup EXIT

# A passing process is not enough: affected Gitleaks releases have returned zero
# while loading the default rules but matching nothing. Prove a default rule can
# still fire before trusting either repository scan.
canary_prefix='sk-proj-'
canary_suffix='abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMN'
printf 'CANARY_OPENAI_API_KEY=%s%s\n' "$canary_prefix" "$canary_suffix" >"$scan_dir/canary.env"
set +e
"$gitleaks_bin" detect \
  --no-git \
  --source "$scan_dir/canary.env" \
  --config "$gitleaks_config" \
  --exit-code "$leak_exit_code" \
  --redact \
  --no-banner \
  --no-color \
  --log-level error \
  >"$scan_dir/canary.log" 2>&1
canary_status=$?
set -e
if [[ "$canary_status" -ne "$leak_exit_code" ]]; then
  echo "Gitleaks canary failed: expected leak exit $leak_exit_code, received $canary_status." >&2
  cat "$scan_dir/canary.log" >&2
  exit 1
fi

run_worktree_scan() {
  local corpus_dir="$scan_dir/worktree"
  local relative_path
  mkdir -p "$corpus_dir"

  while IFS= read -r -d '' relative_path; do
    if [[ ! -f "$scan_source/$relative_path" && ! -L "$scan_source/$relative_path" ]]; then
      continue
    fi
    mkdir -p "$corpus_dir/$(dirname "$relative_path")"
    cp --no-dereference -- "$scan_source/$relative_path" "$corpus_dir/$relative_path"
  done < <(git -C "$scan_source" ls-files --cached --others --exclude-standard -z)

  run_repository_scan "$scan_dir/worktree-report.json" --no-git --source "$corpus_dir"
}

run_history_scan() {
  if [[ "$(git -C "$scan_source" rev-parse --is-shallow-repository)" != 'false' ]]; then
    echo 'Full secret-history scanning requires a non-shallow checkout.' >&2
    exit 1
  fi

  run_repository_scan "$scan_dir/history-report.json" --source "$scan_source"
}

run_repository_scan() {
  local report_path="$1"
  local scan_status
  shift

  set +e
  "$gitleaks_bin" detect \
    "$@" \
    --config "$gitleaks_config" \
    --exit-code "$leak_exit_code" \
    --report-format json \
    --report-path "$report_path" \
    --no-banner \
    --no-color
  scan_status=$?
  set -e

  if [[ "$scan_status" -ne 0 && "$scan_status" -ne "$leak_exit_code" ]]; then
    echo "Gitleaks scan failed with exit code $scan_status." >&2
    exit "$scan_status"
  fi

  node "$report_verifier" "$report_path"
}

case "$scan_mode" in
  worktree)
    run_worktree_scan
    ;;
  history)
    run_history_scan
    ;;
  all)
    run_worktree_scan
    run_history_scan
    ;;
esac

echo "Gitleaks canary and $scan_mode secret scan passed."
