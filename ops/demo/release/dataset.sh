#!/usr/bin/env bash
set -Eeuo pipefail

action="${1:-initialize}"
case "$action" in initialize|reset) ;; *) exit 2 ;; esac

psql_base=(psql -X -v ON_ERROR_STOP=1 -h postgres -U bricomaitre_demo_owner)
sql() { "${psql_base[@]}" -d postgres "$@"; }
expected_revision="$DEMO_DATA_REVISION"
stored_revision="$(sql -Atc "SELECT coalesce(shobj_description(oid, 'pg_database'), '') FROM pg_database WHERE datname = 'bricomaitre_demo_template'")"
if [[ -n "$stored_revision" && "$stored_revision" != "bricomaitre-demo-template:$expected_revision" ]]; then
  printf 'This volume belongs to a different demo release. Use the documented clean-install procedure.\n' >&2
  exit 1
fi
initialized="$("${psql_base[@]}" -d bricomaitre_demo -Atc "SELECT to_regclass('demo_runtime.live_metadata') IS NOT NULL")"
if [[ "$action" = initialize && "$initialized" = t ]]; then
  printf 'Existing demo data preserved.\n'
  exit 0
fi

rebuild=false
if [[ "$action" = reset && "$initialized" = t ]]; then
  current="$("${psql_base[@]}" -d bricomaitre_demo -Atc "SELECT built_at::date = CURRENT_DATE FROM demo_runtime.template_metadata WHERE id = 1")"
  if [[ "$current" != t ]]; then rebuild=true; fi
fi

active="$(sql -Atc "SELECT count(*) FROM pg_stat_activity WHERE datname = 'bricomaitre_demo' AND usename <> 'bricomaitre_demo_owner'")"
if [[ "$active" != 0 ]]; then
  printf 'Stop the five application services before resetting the demo.\n' >&2
  exit 1
fi

if [[ -z "$stored_revision" || "$rebuild" = true ]]; then
  printf 'Building the dated dataset. This can take several minutes.\n'
  "${psql_base[@]}" -d bricomaitre_demo -v asset_origin="$DEMO_OBJECT_PUBLIC_ORIGIN" \
    -v storefront_origin="$DEMO_STOREFRONT_ORIGIN" -v build_key="$expected_revision" -f /seed/seed.sql
  if [[ -n "$stored_revision" ]]; then
    sql <<'SQL'
ALTER DATABASE bricomaitre_demo_template IS_TEMPLATE false;
DROP DATABASE bricomaitre_demo_template;
SQL
  fi
  sql -v template_comment="bricomaitre-demo-template:$expected_revision" <<'SQL'
CREATE DATABASE bricomaitre_demo_template WITH TEMPLATE bricomaitre_demo OWNER bricomaitre_demo_owner;
COMMENT ON DATABASE bricomaitre_demo_template IS :'template_comment';
UPDATE pg_database SET datistemplate = true, datallowconn = false
WHERE datname = 'bricomaitre_demo_template';
SQL
fi

# Only the disposable application database is replaced. The immutable template
# and the installation credentials survive resets.
sql <<'SQL'
DROP DATABASE bricomaitre_demo;
CREATE DATABASE bricomaitre_demo WITH TEMPLATE bricomaitre_demo_template OWNER bricomaitre_demo_owner;
SQL
/bin/bash /bundle/ops/docker/postgres/init-roles.sh
"${psql_base[@]}" -d bricomaitre_demo -v asset_origin="$DEMO_OBJECT_PUBLIC_ORIGIN" \
  -v storefront_origin="$DEMO_STOREFRONT_ORIGIN" -f /seed/live.sql
printf 'Demo dataset ready.\n'
