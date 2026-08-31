#!/usr/bin/env bash
set -euo pipefail
umask 077

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

# shellcheck source=load-infra-env.sh
source "$script_dir/load-infra-env.sh"

backup_input="${1:-}"
temporary_directory=""
container_name="bric-postgres-restore-verify-$(date +%Y%m%d%H%M%S)-$$"
volume_name="$container_name-data"
restore_image="${BRIC_POSTGRES_RESTORE_IMAGE:-postgres:16-bookworm@sha256:bb3e1a57e5407e0a5280b4211980a5e537f4abd234a87014ac979849a78dd825}"
restore_database="bric_restore_verify"
restore_user="${POSTGRES_USER:-bricadmin}"

cleanup() {
  local status=$?
  trap - EXIT
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  docker volume rm "$volume_name" >/dev/null 2>&1 || true
  if [[ -n "$temporary_directory" ]]; then
    rm -rf -- "$temporary_directory"
  fi
  exit "$status"
}

trap cleanup EXIT

if [[ -z "$backup_input" && -n "${BACKUP_S3_URI:-}" ]]; then
  # shellcheck source=use-backup-aws-credentials.sh
  source "$script_dir/use-backup-aws-credentials.sh"
  if [[ -z "${AWS_REGION:-}" ]]; then
    echo 'AWS_REGION is required to verify a backup from S3' >&2
    exit 1
  fi
  if ! command -v aws >/dev/null 2>&1; then
    echo 'aws CLI is required to verify a backup from S3' >&2
    exit 1
  fi
  "$script_dir/validate-s3-backup-privacy.sh"

  if [[ ! "$BACKUP_S3_URI" =~ ^s3://([^/]+)(/(.*))?$ ]]; then
    echo 'BACKUP_S3_URI must be an s3:// bucket URI' >&2
    exit 1
  fi
  backup_bucket="${BASH_REMATCH[1]}"
  backup_prefix="${BASH_REMATCH[3]:-}"
  if [[ -n "$backup_prefix" ]]; then
    backup_prefix="${backup_prefix%/}/"
  fi
  latest_key="$(
    aws s3api list-objects-v2 \
      --bucket "$backup_bucket" \
      --prefix "$backup_prefix" \
      --region "$AWS_REGION" \
      --query "reverse(sort_by(Contents[?ends_with(Key, '.sql.gz')], &LastModified))[0].Key" \
      --output text
  )"
  if [[ -z "$latest_key" || "$latest_key" == 'None' ]]; then
    echo "no compressed Postgres backup found under $BACKUP_S3_URI" >&2
    exit 1
  fi
  backup_name="$(basename "$latest_key")"
  if [[ ! "$backup_name" =~ ^postgres-[0-9]{8}-[0-9]{6}\.sql\.gz$ ]]; then
    echo "latest S3 object is not a canonical Postgres backup: $latest_key" >&2
    exit 1
  fi

  temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/bric-postgres-restore.XXXXXX")"
  backup_file="$temporary_directory/$backup_name"
  aws s3 cp "s3://$backup_bucket/$latest_key" "$backup_file" \
    --region "$AWS_REGION" \
    --only-show-errors
elif [[ -n "$backup_input" ]]; then
  backup_file="$backup_input"
else
  backup_dir="${BACKUP_DIR:-/srv/bric/backups}"
  backup_file="$(
    find "$backup_dir" -maxdepth 1 -type f -name 'postgres-*.sql.gz' -printf '%T@ %p\n' \
      | sort -nr \
      | head -n1 \
      | cut -d' ' -f2-
  )"
fi

if [[ -z "${backup_file:-}" || ! -f "$backup_file" || -L "$backup_file" ]]; then
  echo "backup is missing, not a regular file, or is a symlink: ${backup_file:-<none>}" >&2
  exit 1
fi

gzip -t "$backup_file"
backup_sha256="$(sha256sum "$backup_file" | cut -d' ' -f1)"
backup_bytes="$(stat -c '%s' "$backup_file")"

docker volume create \
  --label com.bricomaitre.purpose=postgres-restore-verification \
  "$volume_name" >/dev/null
docker run --detach --rm \
  --name "$container_name" \
  --network none \
  --memory "${BRIC_POSTGRES_RESTORE_MEMORY:-1024m}" \
  --cpus "${BRIC_POSTGRES_RESTORE_CPUS:-1}" \
  --pids-limit 128 \
  --volume "$volume_name:/var/lib/postgresql/data" \
  --tmpfs /tmp:rw,nosuid,nodev,noexec,size=64m \
  --env POSTGRES_PASSWORD=restore-verification-only \
  --env POSTGRES_USER="$restore_user" \
  --env POSTGRES_DB="$restore_database" \
  "$restore_image" >/dev/null

ready=false
for ((attempt = 1; attempt <= 90; attempt++)); do
  # pg_isready can succeed against the temporary initialization server before
  # POSTGRES_DB has been created. Probe the actual target database instead.
  if docker exec "$container_name" \
    psql --set ON_ERROR_STOP=1 -Atqc 'SELECT 1' -U "$restore_user" -d "$restore_database" \
    >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  echo 'isolated restore-verification Postgres did not become ready' >&2
  docker logs --tail 100 "$container_name" >&2 || true
  exit 1
fi

gzip -dc "$backup_file" \
  | docker exec -i "$container_name" \
    psql --set ON_ERROR_STOP=1 -U "$restore_user" -d "$restore_database" >/dev/null

verification_output="$(
  docker exec -i "$container_name" \
    psql --set ON_ERROR_STOP=1 -At -U "$restore_user" -d "$restore_database" <<'SQL'
DO $verify$
BEGIN
  IF to_regclass('public.products') IS NULL THEN
    RAISE EXCEPTION 'restored database is missing public.products';
  END IF;
  IF to_regclass('public.orders') IS NULL THEN
    RAISE EXCEPTION 'restored database is missing public.orders';
  END IF;
  IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN
    RAISE EXCEPTION 'restored database is missing the Drizzle migration ledger';
  END IF;
  IF (SELECT count(*) FROM drizzle.__drizzle_migrations) < 1 THEN
    RAISE EXCEPTION 'restored Drizzle migration ledger is empty';
  END IF;
END
$verify$;
SELECT pg_database_size(current_database());
SQL
)"

restored_bytes="$(tail -n1 <<<"$verification_output")"
if [[ ! "$restored_bytes" =~ ^[0-9]+$ ]]; then
  echo "restore verification returned an invalid database size: $restored_bytes" >&2
  exit 1
fi

printf 'postgres backup restore verified: file=%s sha256=%s compressed_bytes=%s restored_bytes=%s\n' \
  "$(basename "$backup_file")" \
  "$backup_sha256" \
  "$backup_bytes" \
  "$restored_bytes"
