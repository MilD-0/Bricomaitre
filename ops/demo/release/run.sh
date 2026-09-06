#!/bin/sh
set -eu

load_env() {
  while IFS= read -r assignment || [ -n "$assignment" ]; do
    case "$assignment" in ''|'#'*) continue ;; esac
    export "$assignment"
  done < "$1"
}

task="$1"
shift
case "$task" in
  admin|admin-worker|storefront-api|storefront-marketing-worker|storefront|mock-services)
    load_env /runtime/app.env
    exec "$@"
    ;;
esac
load_env /runtime/compose.env
case "$task" in
  postgres)
    export POSTGRES_DB=bricomaitre_demo POSTGRES_USER=bricomaitre_demo_owner
    export POSTGRES_PASSWORD="$DEMO_POSTGRES_OWNER_PASSWORD"
    exec /usr/local/bin/docker-entrypoint.sh postgres "$@"
    ;;
  redis|redis-health)
    export REDISCLI_AUTH="$DEMO_REDIS_PASSWORD"
    if [ "$task" = redis-health ]; then exec redis-cli ping; fi
    exec /usr/local/bin/docker-entrypoint.sh redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy noeviction --requirepass "$DEMO_REDIS_PASSWORD"
    ;;
  object-storage)
    export MINIO_ROOT_USER="$DEMO_S3_ACCESS_KEY" MINIO_ROOT_PASSWORD="$DEMO_S3_SECRET_KEY"
    export MINIO_BROWSER_REDIRECT_URL="$DEMO_OBJECT_CONSOLE_ORIGIN"
    export MINIO_KMS_SECRET_KEY="demo-key:$DEMO_S3_KMS_KEY"
    exec minio server /data --console-address :9001
    ;;
  media)
    exec /bin/sh /init.sh "$@"
    ;;
  owner)
    export POSTGRES_DB=bricomaitre_demo POSTGRES_USER=bricomaitre_demo_owner POSTGRES_HOST=postgres
    export PGPASSWORD="$DEMO_POSTGRES_OWNER_PASSWORD"
    export POSTGRES_ADMIN_USER=bricomaitre_demo_admin POSTGRES_ADMIN_PASSWORD="$DEMO_POSTGRES_ADMIN_PASSWORD"
    export POSTGRES_STOREFRONT_USER=bricomaitre_demo_storefront POSTGRES_STOREFRONT_PASSWORD="$DEMO_POSTGRES_STOREFRONT_PASSWORD"
    exec "$@"
    ;;
  migrations)
    load_env /runtime/admin.env
    export DATABASE_URL="postgresql://bricomaitre_demo_owner:$DEMO_POSTGRES_OWNER_PASSWORD@postgres:5432/bricomaitre_demo"
    ;;
  *) printf 'Unknown demo process: %s\n' "$task" >&2; exit 2 ;;
esac
exec "$@"
