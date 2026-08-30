#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

# shellcheck source=blue-green.sh
source "$script_dir/blue-green.sh"

postgres_container_id="${1:-$(compose ps -q postgres)}"
postgres_port="${2:-${POSTGRES_PORT:-5432}}"
if [[ -z "$postgres_container_id" ]]; then
  echo 'PostgreSQL container is not running; cannot configure autovacuum.' >&2
  exit 1
fi
if [[ ! "$postgres_port" =~ ^[0-9]+$ ]] ||
  ((postgres_port < 1 || postgres_port > 65535)); then
  echo "Invalid PostgreSQL port: $postgres_port" >&2
  exit 64
fi

verification="$({
  docker exec -i "$postgres_container_id" \
    psql \
    --username "${POSTGRES_USER:-bricadmin}" \
    --dbname "${POSTGRES_DB:-bricadmin}" \
    --port "$postgres_port" \
    --no-psqlrc \
    --quiet \
    --tuples-only \
    --no-align \
    --set ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE admin.action_logs SET (
  autovacuum_vacuum_threshold = 1000,
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_threshold = 500,
  autovacuum_analyze_scale_factor = 0.01
);
ALTER TABLE public.analytics_events SET (
  autovacuum_vacuum_threshold = 1000,
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_threshold = 500,
  autovacuum_analyze_scale_factor = 0.01
);
ALTER TABLE public.meta_event_outbox SET (
  autovacuum_vacuum_threshold = 500,
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_threshold = 250,
  autovacuum_analyze_scale_factor = 0.01
);
COMMIT;

SELECT count(*) = 3 AND bool_and(
  CASE namespace.nspname || '.' || relation.relname
    WHEN 'admin.action_logs' THEN relation.reloptions @> ARRAY[
      'autovacuum_vacuum_threshold=1000',
      'autovacuum_vacuum_scale_factor=0.02',
      'autovacuum_analyze_threshold=500',
      'autovacuum_analyze_scale_factor=0.01'
    ]
    WHEN 'public.analytics_events' THEN relation.reloptions @> ARRAY[
      'autovacuum_vacuum_threshold=1000',
      'autovacuum_vacuum_scale_factor=0.02',
      'autovacuum_analyze_threshold=500',
      'autovacuum_analyze_scale_factor=0.01'
    ]
    WHEN 'public.meta_event_outbox' THEN relation.reloptions @> ARRAY[
      'autovacuum_vacuum_threshold=500',
      'autovacuum_vacuum_scale_factor=0.02',
      'autovacuum_analyze_threshold=250',
      'autovacuum_analyze_scale_factor=0.01'
    ]
    ELSE false
  END
)
FROM pg_class AS relation
JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
WHERE (namespace.nspname, relation.relname) IN (
  ('admin', 'action_logs'),
  ('public', 'analytics_events'),
  ('public', 'meta_event_outbox')
);
SQL
} | tr -d '[:space:]')"

if [[ "$verification" != 't' ]]; then
  echo 'PostgreSQL autovacuum settings did not pass post-apply verification.' >&2
  exit 1
fi

echo 'PostgreSQL high-churn table autovacuum settings are configured and verified.'
