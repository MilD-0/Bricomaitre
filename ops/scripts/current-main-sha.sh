#!/usr/bin/env bash
set -euo pipefail

# Use the authenticated checkout transport instead of the GitHub API. The
# workflow token can clone this private repository while its REST access is
# intentionally narrower on workflow_run events.
git fetch --quiet --no-tags --depth=1 origin refs/heads/main
git rev-parse --verify FETCH_HEAD
