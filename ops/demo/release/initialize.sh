#!/usr/bin/env bash
set -Eeuo pipefail

# The source launcher remains the single definition of demo configuration.
/bundle/demo prepare
node --input-type=module -e '
  import { readFileSync, writeFileSync } from "node:fs";
  const path = "/runtime/compose.env";
  writeFileSync(path, readFileSync(path, "utf8").replace(
    /^DEMO_DATA_REVISION=.*$/m, `DEMO_DATA_REVISION=${process.env.DEMO_RELEASE}`
  ));
'
cp /bundle/ops/demo/release/run.sh /runtime/run.sh
# Apps receive only their own credentials, never the initialization volume.
source /runtime/compose.env
for app in admin storefront-api storefront; do
  target="/runtime-$app"
  install -d -m 0755 "$target"
  cp "/runtime/$app.env" "$target/app.env"
  cp /bundle/ops/demo/release/run.sh "$target/run.sh"
  case "$app" in
    admin)
      printf 'DATABASE_URL=postgresql://bricomaitre_demo_admin:%s@postgres:5432/bricomaitre_demo\n' "$DEMO_POSTGRES_ADMIN_PASSWORD" >>"$target/app.env"
      ;;
    storefront-api)
      printf 'DATABASE_URL=postgresql://bricomaitre_demo_storefront:%s@postgres:5432/bricomaitre_demo\n' "$DEMO_POSTGRES_STOREFRONT_PASSWORD" >>"$target/app.env"
      ;;
  esac
  chmod 644 "$target"/*
done
chmod 755 /runtime
chmod 644 /runtime/*
printf 'Installation credentials are ready.\n'
