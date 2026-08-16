#!/usr/bin/env bash

set -u -o pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: run-ci-check.sh <label> <command> [args...]" >&2
  exit 64
fi

label="$1"
shift

echo "::group::$label"
status=0
"$@" || status=$?

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  if ((status == 0)); then
    printf '%s\n' "- ✅ $label" >> "$GITHUB_STEP_SUMMARY"
  else
    printf '%s\n' "- ❌ $label" >> "$GITHUB_STEP_SUMMARY"
  fi
fi

echo "::endgroup::"
exit "$status"
