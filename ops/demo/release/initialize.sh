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
# App images use an unprivileged UID. This volume contains generated demo
# credentials only and is mounted read-only in consumers.
chmod 755 /runtime
chmod 644 /runtime/*
printf 'Installation credentials are ready.\n'
