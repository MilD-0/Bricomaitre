#!/usr/bin/env bash
set -Eeuo pipefail

target="${1:?Usage: apply-admin-ai-limits.sh <admin-env-file>}"
profile="$(cd "$(dirname "${BASH_SOURCE[0]}")/../env" && pwd)/admin-ai-limits.env"
test -f "$target"
umask 077
pending="$(mktemp "${target}.limits.XXXXXX")"
trap 'rm -f "$pending"' EXIT
awk -F= 'NR == FNR { keys[$1] = 1; next } !($1 in keys)' "$profile" "$target" >"$pending"
cat "$profile" >>"$pending"
mv "$pending" "$target"
