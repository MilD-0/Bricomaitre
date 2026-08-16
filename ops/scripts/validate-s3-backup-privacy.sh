#!/usr/bin/env bash
set -euo pipefail

backup_s3_uri="${BACKUP_S3_URI:-}"
aws_region="${AWS_REGION:-}"

if [[ ! "$backup_s3_uri" =~ ^s3://([^/]+)(/.*)?$ ]]; then
  echo "BACKUP_S3_URI must identify an S3 bucket and optional prefix" >&2
  exit 1
fi

if [[ -z "$aws_region" ]]; then
  echo "AWS_REGION is required when validating backup storage" >&2
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI is required to validate backup storage" >&2
  exit 1
fi

backup_bucket="${BASH_REMATCH[1]}"
public_access_block="$(
  aws s3api get-public-access-block \
    --bucket "$backup_bucket" \
    --region "$aws_region" \
    --query 'PublicAccessBlockConfiguration.[BlockPublicAcls,IgnorePublicAcls,BlockPublicPolicy,RestrictPublicBuckets]' \
    --output text
)"

if [[ ! "$public_access_block" =~ ^True[[:space:]]+True[[:space:]]+True[[:space:]]+True$ ]]; then
  echo "refusing backup upload: every S3 public-access block must be enabled" >&2
  exit 1
fi

policy_is_public="$(
  aws s3api get-bucket-policy-status \
    --bucket "$backup_bucket" \
    --region "$aws_region" \
    --query 'PolicyStatus.IsPublic' \
    --output text
)"

if [[ "$policy_is_public" != 'False' ]]; then
  echo "refusing backup upload: the S3 bucket policy is public or could not be verified" >&2
  exit 1
fi

echo 'S3 backup storage privacy verified.'
