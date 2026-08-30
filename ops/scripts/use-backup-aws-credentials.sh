#!/usr/bin/env bash

# This file is sourced by backup jobs after load-infra-env.sh.
backup_aws_access_key_id="${BACKUP_AWS_ACCESS_KEY_ID:-}"
backup_aws_secret_access_key="${BACKUP_AWS_SECRET_ACCESS_KEY:-}"
backup_aws_session_token="${BACKUP_AWS_SESSION_TOKEN:-}"
backup_aws_profile="${BACKUP_AWS_PROFILE:-}"

if [[ -n "$backup_aws_profile" &&
  ( -n "$backup_aws_access_key_id" || -n "$backup_aws_secret_access_key" || -n "$backup_aws_session_token" ) ]]; then
  echo 'BACKUP_AWS_PROFILE cannot be combined with static backup AWS credentials' >&2
  return 1
fi

if [[ -n "$backup_aws_profile" ]]; then
  if [[ -n "${AWS_PROFILE:-}" && "$backup_aws_profile" == "$AWS_PROFILE" ]]; then
    echo 'BACKUP_AWS_PROFILE must not reuse the application AWS profile' >&2
    return 1
  fi
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
  export AWS_PROFILE="$backup_aws_profile"
  return 0
fi

if [[ -z "$backup_aws_access_key_id" || -z "$backup_aws_secret_access_key" ]]; then
  echo 'BACKUP_AWS_ACCESS_KEY_ID and BACKUP_AWS_SECRET_ACCESS_KEY are required for backup S3 access' >&2
  return 1
fi
if [[ -n "${AWS_ACCESS_KEY_ID:-}" && "$backup_aws_access_key_id" == "$AWS_ACCESS_KEY_ID" ]]; then
  echo 'BACKUP_AWS_ACCESS_KEY_ID must not reuse the application AWS access key' >&2
  return 1
fi

unset AWS_PROFILE
export AWS_ACCESS_KEY_ID="$backup_aws_access_key_id"
export AWS_SECRET_ACCESS_KEY="$backup_aws_secret_access_key"
if [[ -n "$backup_aws_session_token" ]]; then
  export AWS_SESSION_TOKEN="$backup_aws_session_token"
else
  unset AWS_SESSION_TOKEN
fi
