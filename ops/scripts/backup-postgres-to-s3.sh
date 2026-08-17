#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=load-infra-env.sh
source "$(dirname "$0")/load-infra-env.sh"

backup_s3_uri="${BACKUP_S3_URI:-}"

if [[ -z "$backup_s3_uri" ]]; then
  echo "BACKUP_S3_URI is required, for example s3://your-private-backup-bucket/bricadmin" >&2
  exit 1
fi

if [[ -z "${AWS_REGION:-}" ]]; then
  echo "AWS_REGION is required when uploading backups to S3" >&2
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI is required to upload backups to S3" >&2
  exit 1
fi

"$(dirname "$0")/validate-s3-backup-privacy.sh"

backup_output="$("$(dirname "$0")/backup-postgres.sh")"
echo "$backup_output"

backup_file="${backup_output##*written to }"

if [[ ! -f "$backup_file" ]]; then
  echo "expected backup file does not exist: $backup_file" >&2
  exit 1
fi

aws s3 cp "$backup_file" "$backup_s3_uri/$(basename "$backup_file")" \
  --region "$AWS_REGION" \
  --only-show-errors

echo "postgres backup uploaded to $backup_s3_uri/$(basename "$backup_file")"
"$(dirname "$0")/prune-postgres-backups.sh"
