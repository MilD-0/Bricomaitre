import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const productionDockerfiles = [
  { path: 'ops/docker/Dockerfile.admin', appDirectory: 'apps/admin', stages: 4 },
  { path: 'ops/docker/Dockerfile.storefront-api', appDirectory: 'apps/storefront-api', stages: 3 },
  { path: 'ops/docker/Dockerfile.storefront', appDirectory: 'apps/storefront', stages: 2 },
];

describe('production packaging and release runtime', () => {
  it.each(productionDockerfiles)(
    'pins every stage in $path to a Node.js 24 Bookworm digest',
    ({ path, stages }) => {
      const source = readFileSync(resolve(workspaceRoot, path), 'utf8');
      const nodeStages = source.match(/^FROM node:[^\s]+ AS [^\s]+$/gm) ?? [];

      expect(nodeStages).toHaveLength(stages);
      expect(
        nodeStages.every((line) =>
          /^FROM node:24-bookworm-slim@sha256:[a-f0-9]{64} AS /.test(line),
        ),
      ).toBe(true);
    },
  );

  it.each(productionDockerfiles)(
    'copies only the source inputs owned by $path',
    ({ path, appDirectory }) => {
      const source = readFileSync(resolve(workspaceRoot, path), 'utf8');

      expect(source).not.toMatch(/^COPY [.] [.]$/m);
      expect(source).toContain(`COPY ${appDirectory} ./${appDirectory}`);
      expect(source).toContain('COPY packages/storefront-core ./packages/storefront-core');
      expect(source).toContain('COPY ops/ownership ./ops/ownership');
      expect(source).toContain(
        'COPY ops/scripts/hydrate-next-standalone.sh ./ops/scripts/hydrate-next-standalone.sh',
      );
      expect(source).toContain(`bash ops/scripts/hydrate-next-standalone.sh ${appDirectory}`);
      expect(source).toContain('node -e "require(\'next/dist/server/next-server\')"');
    },
  );

  it('prints candidate state and bounded logs when a health gate expires', () => {
    const healthGate = readFileSync(
      resolve(workspaceRoot, 'ops/scripts/wait-for-health.sh'),
      'utf8',
    );

    expect(healthGate).toContain('oom={{.State.OOMKilled}}');
    expect(healthGate).toContain('docker logs --tail 100 "$container_id"');
  });

  it('separates cancellable CI from serialized, verified production releases', () => {
    const ci = readFileSync(resolve(workspaceRoot, '.github/workflows/ci.yml'), 'utf8');
    const release = readFileSync(resolve(workspaceRoot, '.github/workflows/deploy.yml'), 'utf8');

    for (const job of [
      'static-quality',
      'service-contracts',
      'tests',
      'browser-acceptance',
      'admin-browser-acceptance',
      'browser-performance',
      'production-builds',
      'required',
    ]) {
      expect(ci).toContain(`  ${job}:`);
    }
    for (const job of [
      'release-context',
      'build-api-images',
      'build-admin-images',
      'build-storefront-image',
      'assemble-release-manifest',
      'deploy',
    ]) {
      expect(release).toContain(`  ${job}:`);
    }

    expect(ci).toContain('name: CI / Required');
    expect(ci).toContain('cancel-in-progress: true');
    expect(ci).toContain('fail-fast: false');
    expect(ci).toContain('pnpm build:apps');
    expect(ci).toContain(
      "if: github.event_name == 'pull_request' || github.event_name == 'workflow_dispatch'",
    );
    expect(ci).toContain(
      'ops/scripts/run-ci-check.sh "Storefront browser acceptance tests" pnpm test:storefront:browser',
    );
    expect(ci).toContain(
      'ops/scripts/run-ci-check.sh "Admin browser acceptance tests" pnpm test:admin:browser',
    );
    expect(ci).toContain(
      'ops/scripts/run-ci-check.sh "Storefront performance budgets" pnpm test:storefront:performance',
    );
    expect(release).toContain('workflow_run:');
    expect(release).toMatch(/workflow_run:[\s\S]*branches:\s+- main/);
    expect(release).not.toContain('pull-requests: read');
    expect(release).not.toContain('verify-release-pr.sh');
    expect(release).toContain('--build-state "$PWD" "$RELEASE_SHA"');
    expect(release).toContain('"$bundle_dir/.bric-migrations.json"');
    expect(release).toContain('group: bricomaitre-production');
    expect(release).toContain('cancel-in-progress: false');
    expect(release).toContain('Reject a superseded release');
    expect(release.match(/bash ops\/scripts\/current-main-sha[.]sh/g)).toHaveLength(2);
    expect(release).not.toContain('/git/ref/heads/main');
    expect(release).toContain("if: needs.release-context.outputs.current == 'true'");
    expect(release).toContain('image builds were skipped');
    expect(release).toContain('ref: ${{ needs.release-context.outputs.sha }}');
    expect(release).not.toContain('pnpm build:apps');
    expect(release).toContain(
      "ADMIN_META_ADS_SYNC_ENABLED: ${{ vars.ADMIN_META_ADS_SYNC_ENABLED || 'false' }}",
    );
    expect(release).toContain('META_ADS_ACCESS_TOKEN: ${{ secrets.META_ADS_ACCESS_TOKEN }}');
    expect(release).toContain('ADMIN_META_ADS_SYNC_ENABLED must be true or false');
    expect(release).toContain(
      "ADMIN_SEARCH_CONSOLE_SYNC_ENABLED: ${{ vars.ADMIN_SEARCH_CONSOLE_SYNC_ENABLED || 'false' }}",
    );
    expect(release).toContain(
      'GOOGLE_SEARCH_CONSOLE_CREDENTIALS_BASE64: ${{ secrets.GOOGLE_SEARCH_CONSOLE_CREDENTIALS_BASE64 }}',
    );
    expect(release).toContain('ADMIN_SEARCH_CONSOLE_SYNC_ENABLED must be true or false');

    const workspaceSetup = readFileSync(
      resolve(workspaceRoot, '.github/actions/setup-workspace/action.yml'),
      'utf8',
    );
    const actionReferences = [
      ...`${ci}\n${release}\n${workspaceSetup}`.matchAll(/^\s*-?\s*uses:\s+([^\s#]+)/gm),
    ].map(([, reference]) => reference);
    expect(actionReferences.length).toBeGreaterThan(0);
    expect(
      actionReferences.every(
        (reference) =>
          reference.startsWith('./.github/actions/') || /@[a-f0-9]{40}$/.test(reference),
      ),
    ).toBe(true);
    expect(ci.match(/uses: [.][/][.]github[/]actions[/]setup-workspace/g)).toHaveLength(7);
    expect(ci).toContain(
      'uses: docker/setup-buildx-action@bb05f3f5519dd87d3ba754cc423b652a5edd6d2c',
    );
    expect(ci.indexOf('uses: docker/setup-buildx-action@')).toBeLessThan(
      ci.indexOf('run: bash ops/scripts/validate-operations.sh'),
    );
    expect(workspaceSetup).toContain(
      'uses: pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86',
    );
    expect(workspaceSetup).toContain('cache: true');
    expect(release).toContain(
      'GOOGLE_ANALYTICS_MEASUREMENT_ID: ${{ secrets.NEXT_PUBLIC_GA_MEASUREMENT_ID }}',
    );
    expect(release).toContain(
      'GOOGLE_ANALYTICS_API_SECRET: ${{ secrets.GOOGLE_ANALYTICS_API_SECRET }}',
    );
    expect(release).toContain('SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}');
    expect(release).toContain(
      "SENTRY_PROJECT_ADMIN: ${{ vars.SENTRY_PROJECT_ADMIN || 'bricadmin' }}",
    );
    expect(release).toContain(
      "SENTRY_PROJECT_STOREFRONT_API: ${{ vars.SENTRY_PROJECT_STOREFRONT_API || 'brico-api' }}",
    );
    expect(release).toContain(
      "SENTRY_PROJECT_STOREFRONT: ${{ vars.SENTRY_PROJECT_STOREFRONT || 'bricomaitre' }}",
    );
    expect(release).toContain('test -n "$SENTRY_AUTH_TOKEN"');
    expect(release).toContain('SENTRY_DSN_ADMIN=%s');
    expect(release).toContain('SENTRY_DSN_STOREFRONT_API=%s');
    expect(release).toContain('SENTRY_DSN_STOREFRONT=%s');
    expect(release).toContain(
      'TIKTOK_EVENTS_API_ACCESS_TOKEN: ${{ secrets.TIKTOK_EVENTS_API_ACCESS_TOKEN }}',
    );
    expect(release).toContain(
      'TikTok destination requires both pixel ID and Events API access token',
    );
    expect(release).toContain('MARKETING_GOOGLE_DESTINATION_ENABLED=true');
    expect(release).toContain('MARKETING_TIKTOK_DESTINATION_ENABLED=%s');
  });

  it('keeps action and container pins on a bounded update schedule', () => {
    const dependabot = readFileSync(resolve(workspaceRoot, '.github/dependabot.yml'), 'utf8');

    expect(dependabot).toContain('package-ecosystem: github-actions');
    expect(dependabot).toContain('package-ecosystem: docker');
    expect(dependabot.match(/interval: monthly/g)).toHaveLength(3);
    expect(dependabot).toContain('open-pull-requests-limit: 5');
  });

  it('validates shell operations with a pinned, integrity-checked ShellCheck release', () => {
    const validator = readFileSync(
      resolve(workspaceRoot, 'ops/scripts/validate-operations.sh'),
      'utf8',
    );

    expect(validator).toContain("shellcheck_version='0.11.0'");
    expect(validator).toContain('"$installed_shellcheck" --version | grep -Fxq');
    expect(validator).toContain(
      "shellcheck_sha256='8c3be12b05d5c177a04c29e3c78ce89ac86f1595681cab149b65b97c4e227198'",
    );
    expect(validator).toContain(
      "shellcheck_sha256='12b331c1d2db6b9eb13cfca64306b1b157a86eb69db83023e261eaa7e7c14588'",
    );
    expect(validator).toContain('printf \'%s  %s\\n\' "$shellcheck_sha256"');
    expect(validator).toContain(
      '"$shellcheck_bin" --external-sources --source-path=SCRIPTDIR "${shell_scripts[@]}"',
    );
  });

  it('defines bounded registry caches, OCI identity, and grouped Bake builds', () => {
    const bake = readFileSync(resolve(workspaceRoot, 'ops/docker/docker-bake.hcl'), 'utf8');

    expect(bake).toContain('group "api"');
    expect(bake).toContain('group "admin"');
    expect(bake).toContain('group "storefront"');
    expect(bake.match(/cache-from/g)).toHaveLength(4);
    expect(bake.match(/cache-to/g)).toHaveLength(4);
    expect(bake).toContain('mode=max,image-manifest=true,oci-mediatypes=true');
    expect(bake).toMatch(
      /target "_admin"[\s\S]*?cache-from = \[registry_cache\("admin-worker"\)\]/,
    );
    expect(bake).toMatch(
      /target "admin-worker"[\s\S]*?cache-to\s+= \[registry_cache_max\("admin-worker"\)\]/,
    );
    expect(bake).not.toContain('registry_cache_max("admin-web")');
    expect(bake).not.toContain('registry_cache_max("admin-migrations")');
    expect(bake).toContain('BRIC_IMAGE_REVISION = IMAGE_REVISION');
    expect(bake).toContain('BRIC_IMAGE_CREATED  = IMAGE_CREATED');
  });

  it('packages the storefront app as the only current storefront release surface', () => {
    const dockerfile = readFileSync(
      resolve(workspaceRoot, 'ops/docker/Dockerfile.storefront'),
      'utf8',
    );
    const compose = readFileSync(resolve(workspaceRoot, 'ops/docker/compose.prod.yml'), 'utf8');
    const storefrontPackage = JSON.parse(
      readFileSync(resolve(workspaceRoot, 'apps/storefront/package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };

    expect(dockerfile).toContain('pnpm --filter @bric/storefront build');
    expect(storefrontPackage.scripts.build).toBe('next build --webpack');
    expect(dockerfile).toContain(
      '"/app/apps/storefront/.next/cache", "node", "apps/storefront/server.js"',
    );
    expect(dockerfile).toContain('com.bricomaitre.release-surface="storefront"');
    expect(dockerfile).not.toMatch(/storefront-(?:new|old|v\d+)|storefront\d+/);
    expect(compose).toContain('storefront-cache-blue:/app/apps/storefront/.next/cache');
    expect(compose).toContain('storefront-cache-green:/app/apps/storefront/.next/cache');
    expect(compose).toContain('BRIC_NEXT_FETCH_CACHE_MAX_BYTES:');
    expect(compose).toContain('BRIC_NEXT_FETCH_CACHE_MAX_AGE_SECONDS:');
    expect(compose).toContain('BRIC_NEXT_FETCH_CACHE_PRUNE_INTERVAL_SECONDS:');

    const installIndex = dockerfile.indexOf('pnpm install --frozen-lockfile');
    expect(dockerfile.indexOf('ARG NEXT_PUBLIC_RELEASE')).toBeGreaterThan(installIndex);
    expect(dockerfile.indexOf('ENV NEXT_PUBLIC_RELEASE=')).toBeGreaterThan(installIndex);
  });

  it('packages worker bundles without copying development workspaces', () => {
    const admin = readFileSync(resolve(workspaceRoot, 'ops/docker/Dockerfile.admin'), 'utf8');
    const api = readFileSync(
      resolve(workspaceRoot, 'ops/docker/Dockerfile.storefront-api'),
      'utf8',
    );
    const adminWorker = admin.slice(admin.indexOf(' AS worker'), admin.indexOf(' AS migrations'));
    const adminMigrations = admin.slice(admin.indexOf(' AS migrations'));
    const metaWorker = api.slice(api.indexOf(' AS meta-worker'));

    expect(adminWorker).not.toContain('/workspace/node_modules ./node_modules');
    expect(adminWorker).toContain('/runtime/node_modules ./node_modules');
    expect(adminMigrations).not.toContain('/workspace/node_modules');
    expect(metaWorker).not.toContain('/workspace/node_modules');
    expect(adminWorker).toContain('/BRIC_WORKER_HEARTBEAT_V1');
    expect(metaWorker).toContain('/BRIC_WORKER_HEARTBEAT_V1');
    expect(admin).toContain('BRIC_WORKER_SOURCEMAPS=1');
    expect(api).toContain('BRIC_WORKER_SOURCEMAPS=1');
  });

  it('uploads exact-release Sentry source maps through build secrets', () => {
    const admin = readFileSync(resolve(workspaceRoot, 'ops/docker/Dockerfile.admin'), 'utf8');
    const api = readFileSync(
      resolve(workspaceRoot, 'ops/docker/Dockerfile.storefront-api'),
      'utf8',
    );
    const storefront = readFileSync(
      resolve(workspaceRoot, 'ops/docker/Dockerfile.storefront'),
      'utf8',
    );
    const bake = readFileSync(resolve(workspaceRoot, 'ops/docker/docker-bake.hcl'), 'utf8');
    const workerBuilder = readFileSync(
      resolve(workspaceRoot, 'ops/scripts/build-worker.mjs'),
      'utf8',
    );

    for (const dockerfile of [admin, api, storefront]) {
      expect(dockerfile).toContain('--mount=type=secret,id=sentry_auth_token');
      expect(dockerfile).toContain('SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token)"');
      expect(dockerfile).not.toMatch(/ARG SENTRY_AUTH_TOKEN|ENV SENTRY_AUTH_TOKEN/);
    }
    expect(bake).toContain('SENTRY_RELEASE      = IMAGE_REVISION');
    expect(bake.match(/id=sentry_auth_token,env=SENTRY_AUTH_TOKEN/g)).toHaveLength(3);
    expect(workerBuilder).toContain("process.env.BRIC_WORKER_SOURCEMAPS === '1'");
    expect(workerBuilder).toContain("sourcemap: emitSourceMap ? 'external' : false");
  });

  it('bounds and health-checks every long-running application process', () => {
    const compose = readFileSync(resolve(workspaceRoot, 'ops/docker/compose.prod.yml'), 'utf8');

    for (const anchor of [
      'x-storefront-api-blue:',
      'x-storefront-meta-worker:',
      'x-admin-blue:',
      'x-admin-worker-blue:',
      'x-storefront-blue:',
    ]) {
      const start = compose.indexOf(anchor);
      const end = compose.indexOf('\n\nx-', start + anchor.length);
      const definition = compose.slice(
        start,
        end === -1 ? compose.indexOf('\n\nservices:', start) : end,
      );
      expect(definition).toContain('init: true');
      expect(definition).toContain('pids_limit:');
      expect(definition).toContain('stop_grace_period: 30s');
      expect(definition).toContain('healthcheck:');
    }
    expect(compose).not.toContain('process.kill(1, 0)');
    expect(compose).toContain('bric-admin-worker-heartbeat');
    expect(compose).toContain('bric-storefront-meta-worker-heartbeat');
  });

  it('gives the public commerce path explicit memory and OOM priority over admin', () => {
    const compose = readFileSync(resolve(workspaceRoot, 'ops/docker/compose.prod.yml'), 'utf8');

    expect(compose).toContain('oom_score_adj: ${BRIC_STOREFRONT_API_OOM_SCORE_ADJ:--900}');
    expect(compose).toContain('mem_limit: ${BRIC_STOREFRONT_API_MEM_LIMIT:-1536m}');
    expect(compose).toContain('mem_reservation: ${BRIC_STOREFRONT_API_MEM_RESERVATION:-1024m}');
    expect(compose).toContain('oom_score_adj: ${BRIC_STOREFRONT_WEB_OOM_SCORE_ADJ:--900}');
    expect(compose).toContain('mem_limit: ${BRIC_STOREFRONT_WEB_MEM_LIMIT:-3072m}');
    expect(compose).toContain('mem_reservation: ${BRIC_STOREFRONT_WEB_MEM_RESERVATION:-1536m}');
    expect(compose).toContain('oom_score_adj: ${BRIC_ADMIN_WEB_OOM_SCORE_ADJ:-500}');
    expect(compose).toContain('mem_limit: ${BRIC_ADMIN_WEB_MEM_LIMIT:-1200m}');
    expect(compose).toContain('oom_score_adj: ${BRIC_ADMIN_WORKER_OOM_SCORE_ADJ:-650}');
    expect(compose).toContain('mem_limit: ${BRIC_ADMIN_WORKER_MEM_LIMIT:-640m}');
    expect(compose).toContain('oom_score_adj: ${BRIC_NGINX_OOM_SCORE_ADJ:--950}');
  });

  it('propagates the immutable release identity to every application process', () => {
    const compose = readFileSync(resolve(workspaceRoot, 'ops/docker/compose.prod.yml'), 'utf8');

    expect(compose).toContain(
      'x-release-environment: &release-environment\n  SENTRY_RELEASE: ${BRIC_RELEASE_COMMIT:-unknown}',
    );
    expect(compose.match(/<<: \*release-environment/g)).toHaveLength(10);
  });

  it('keeps atomic Nginx cutover renders visible inside the container', () => {
    const compose = readFileSync(resolve(workspaceRoot, 'ops/docker/compose.prod.yml'), 'utf8');
    const blueGreen = readFileSync(resolve(workspaceRoot, 'ops/scripts/blue-green.sh'), 'utf8');

    expect(compose).toContain('${BRIC_RUNTIME_DIR:-/srv/bric/runtime}/nginx:/etc/nginx/conf.d:ro');
    expect(compose).toContain(
      '${BRIC_RUNTIME_DIR:-/srv/bric/runtime}/nginx-main:/etc/nginx-main:ro',
    );
    expect(compose).toContain("'-c', '/etc/nginx-main/nginx.conf'");
    expect(compose).not.toContain('../nginx/nginx.conf:/etc/nginx/nginx.conf:ro');
    expect(compose).not.toContain(
      '${BRIC_RUNTIME_DIR:-/srv/bric/runtime}/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro',
    );
    expect(blueGreen).toContain('compose exec -T nginx nginx -t -c /etc/nginx-main/nginx.conf');
    expect(blueGreen).toContain(
      'compose exec -T nginx nginx -s reload -c /etc/nginx-main/nginx.conf',
    );
    expect(blueGreen).toContain('begin_nginx_main_config_transaction()');
    expect(blueGreen).toContain('rollback_nginx_main_config_transaction()');
  });

  it('uses one canonical administration service identity across the active runtime', () => {
    const compose = readFileSync(resolve(workspaceRoot, 'ops/docker/compose.prod.yml'), 'utf8');
    const nginx = readFileSync(
      resolve(workspaceRoot, 'ops/nginx/templates/default.conf.template'),
      'utf8',
    );
    const blueGreen = readFileSync(resolve(workspaceRoot, 'ops/scripts/blue-green.sh'), 'utf8');
    const deploy = readFileSync(resolve(workspaceRoot, 'ops/scripts/deploy.sh'), 'utf8');
    const rollback = readFileSync(resolve(workspaceRoot, 'ops/scripts/rollback.sh'), 'utf8');

    expect(compose).toContain('\n  admin-blue:');
    expect(compose).toContain('\n  admin-green:');
    expect(nginx).toContain('set $admin_upstream admin-${BRIC_ACTIVE_SLOT}:3000;');
    expect(nginx).toContain('proxy_pass http://$admin_upstream;');
    expect(`${compose}\n${nginx}\n${blueGreen}\n${deploy}\n${rollback}`).not.toContain(
      ['admin', 'stration'].join(''),
    );
  });

  it('keeps Redis-sensitive host memory settings reproducible', () => {
    const sysctl = readFileSync(
      resolve(workspaceRoot, 'ops/host/99-bricomaitre-redis.conf'),
      'utf8',
    );
    const thpUnit = readFileSync(
      resolve(workspaceRoot, 'ops/host/bricomaitre-disable-thp.service'),
      'utf8',
    );
    const installer = readFileSync(
      resolve(workspaceRoot, 'ops/scripts/configure-production-host.sh'),
      'utf8',
    );
    const backupCron = readFileSync(
      resolve(workspaceRoot, 'ops/host/bricomaitre-backups.cron'),
      'utf8',
    );
    const maintenanceLogrotate = readFileSync(
      resolve(workspaceRoot, 'ops/host/bricomaitre-maintenance.logrotate'),
      'utf8',
    );
    const release = readFileSync(resolve(workspaceRoot, '.github/workflows/deploy.yml'), 'utf8');

    expect(sysctl).toContain('vm.overcommit_memory = 1');
    expect(thpUnit).toContain('Before=docker.service');
    expect(thpUnit).toContain('transparent_hugepage/enabled');
    expect(installer).toContain('systemctl enable --now bricomaitre-disable-thp.service');
    expect(installer).toContain('/proc/sys/vm/overcommit_memory');
    expect(installer).toContain('bricomaitre-backups.cron');
    expect(installer).toContain('bricomaitre-maintenance.logrotate');
    expect(installer).toContain('/etc/logrotate.d/bricomaitre-maintenance');
    expect(installer).toContain('/var/log/bric-postgres-restore.log');
    expect(backupCron).toContain('backup-postgres-to-s3.sh');
    expect(backupCron).toContain('verify-postgres-backup-restore.sh');
    expect(backupCron).toContain('BRIC_POSTGRES_RESTORE_MEMORY=512m');
    expect(backupCron).toContain('/usr/bin/flock -n');
    expect(maintenanceLogrotate).toContain('/var/log/bric-postgres-backup.log');
    expect(maintenanceLogrotate).toContain('/var/log/bric-postgres-restore.log');
    expect(maintenanceLogrotate).toContain('/var/log/bric-action-log-cleanup.log');
    expect(maintenanceLogrotate).toContain('rotate 14');
    expect(maintenanceLogrotate).toContain('maxsize 20M');
    expect(maintenanceLogrotate).toContain('create 0640 {{OPERATIONS_USER}} {{OPERATIONS_GROUP}}');
    expect(release).toContain('rsync -a ops/host/ "$bundle_dir/ops/host/"');
  });

  it('uses compatible filesystems, bounded logs, and privacy-safe access logs', () => {
    const compose = readFileSync(resolve(workspaceRoot, 'ops/docker/compose.prod.yml'), 'utf8');
    const nginx = readFileSync(resolve(workspaceRoot, 'ops/nginx/nginx.conf'), 'utf8');

    expect(compose).toContain('read_only: false');
    expect(compose).toContain('beneath .next/server');
    expect(compose).toContain('x-logging: &default-logging');
    expect(compose).toContain('max-size: ${BRIC_LOG_MAX_SIZE:-20m}');
    expect(compose.match(/logging: \*default-logging/g)).toHaveLength(9);
    expect(compose).not.toContain('/var/cache/nginx:size=32m,mode=0755');
    expect(compose).toContain('nginx-storefront-image-cache:/var/cache/nginx');
    expect(compose).toContain('\n  nginx-storefront-image-cache:');
    expect(compose).toContain(
      'curl --fail --silent --show-error --insecure --resolve "${BRIC_API_DOMAIN:-api.example.com}:443:127.0.0.1"',
    );
    expect(compose).toContain(
      'curl --fail --silent --show-error --insecure --resolve "${BRIC_STOREFRONT_DOMAIN:-www.example.com}:443:127.0.0.1"',
    );
    expect(nginx).toContain('$request_method $uri $server_protocol');
    expect(nginx).toContain('$request_id $remote_addr');
    expect(nginx).toContain('proxy_cache_path /var/cache/nginx/storefront-images');
    expect(nginx).toContain('max_size=384m');
    expect(nginx).toContain('text/x-component');
    expect(nginx).not.toContain('"$request"');
    expect(nginx).not.toContain('$http_referer');
  });

  it('starts complete candidate services only after their images are available', () => {
    const deploy = readFileSync(resolve(workspaceRoot, 'ops/scripts/deploy.sh'), 'utf8');
    const storefrontPull = deploy.indexOf('compose pull "$admin_service" "$storefront_service"');
    const storefrontStart = deploy.indexOf(
      'compose up -d --force-recreate "$admin_service" "$storefront_service"',
    );

    expect(storefrontPull).toBeGreaterThan(-1);
    expect(storefrontStart).toBeGreaterThan(storefrontPull);
  });

  it('reconciles PostgreSQL and Redis serially before candidate services', () => {
    const deploy = readFileSync(resolve(workspaceRoot, 'ops/scripts/deploy.sh'), 'utf8');
    const postgresStart = deploy.indexOf('compose up -d postgres');
    const postgresHealth = deploy.indexOf('wait-for-health.sh" postgres');
    const redisStart = deploy.indexOf('compose up -d redis');
    const redisHealth = deploy.indexOf('wait-for-health.sh" redis');
    const apiStart = deploy.indexOf('compose up -d --force-recreate "$api_service"');

    expect(postgresStart).toBeGreaterThan(-1);
    expect(postgresHealth).toBeGreaterThan(postgresStart);
    expect(redisStart).toBeGreaterThan(postgresHealth);
    expect(redisHealth).toBeGreaterThan(redisStart);
    expect(apiStart).toBeGreaterThan(redisHealth);
    expect(deploy).not.toContain('compose up -d postgres redis');
  });

  it('rebuilds persisted reporting with the candidate artifact before cutover', () => {
    const deploy = readFileSync(resolve(workspaceRoot, 'ops/scripts/deploy.sh'), 'utf8');
    const migrationImage = readFileSync(
      resolve(workspaceRoot, 'ops/docker/Dockerfile.admin'),
      'utf8',
    );
    const workerHealth = deploy.indexOf('wait-for-health.sh" "$worker_service"');
    const refresh = deploy.indexOf('refresh-release-reporting.sh" "$target_slot"');
    const routing = deploy.indexOf('routing_changed=true');

    expect(migrationImage).toContain('refresh-release-reporting.cjs');
    expect(migrationImage).toContain('refresh-reporting) node');
    expect(workerHealth).toBeGreaterThan(-1);
    expect(refresh).toBeGreaterThan(workerHealth);
    expect(refresh).toBeLessThan(routing);
  });

  it('proves migration rollback compatibility before candidate cutover', () => {
    const deploy = readFileSync(resolve(workspaceRoot, 'ops/scripts/deploy.sh'), 'utf8');
    const safetyGate = deploy.indexOf('verify-migration-rollback-safety.py');
    const migration = deploy.indexOf('run-admin-migrations.sh" "$target_slot"');
    const previousSmoke = deploy.indexOf(
      'Previous slot ${previous_slot} remained rollback-compatible',
    );
    const candidateApps = deploy.indexOf(
      'compose up -d --force-recreate "$admin_service" "$storefront_service"',
    );

    expect(safetyGate).toBeGreaterThan(-1);
    expect(safetyGate).toBeLessThan(migration);
    expect(deploy).toContain('release is missing migration state');
    expect(deploy).toContain('wait-for-health.sh" "$previous_api_service"');
    expect(deploy).toContain('wait-for-health.sh" "$previous_admin_service"');
    expect(deploy).toContain('wait-for-health.sh" "$previous_storefront_service"');
    expect(deploy).toContain('wait-for-health.sh" "$previous_worker_service"');
    expect(previousSmoke).toBeGreaterThan(migration);
    expect(previousSmoke).toBeLessThan(candidateApps);
  });

  it('restores failed candidates and rolls back to an explicit verified release', () => {
    const deploy = readFileSync(resolve(workspaceRoot, 'ops/scripts/deploy.sh'), 'utf8');
    const rollback = readFileSync(resolve(workspaceRoot, 'ops/scripts/rollback.sh'), 'utf8');
    const blueGreen = readFileSync(resolve(workspaceRoot, 'ops/scripts/blue-green.sh'), 'utf8');

    expect(blueGreen).toContain('begin_image_state_transaction()');
    expect(blueGreen).toContain('rollback_image_state_transaction()');
    expect(blueGreen).toContain('rollback_nginx_main_config_transaction()');
    expect(blueGreen).toContain('render_release_nginx_config()');
    expect(blueGreen).toContain('remove_slot_release_services()');
    expect(deploy).toContain('trap cleanup_failed_deployment EXIT');
    expect(rollback).toContain('trap cleanup_failed_rollback EXIT');
    expect(deploy).toContain('stage_nginx_main_config');
    expect(rollback).toContain('stage_nginx_main_config');
    expect(rollback).toContain('target_release="$(release_link_target "$previous_link")"');
    expect(deploy).toContain(
      'render_release_nginx_config "$original_current_release" "$previous_slot"',
    );
    expect(rollback).toContain('render_release_nginx_config "$target_release" "$target_slot"');
    expect(rollback).toContain('render_release_nginx_config "$current_release" "$current_slot"');
    expect(deploy).toContain('preserving the candidate services');
    expect(rollback).toContain('preserving the rollback candidate');
    expect(deploy.indexOf('routing_changed=true')).toBeLessThan(
      deploy.indexOf('render_nginx_config "$target_slot"'),
    );
    expect(rollback.indexOf('routing_changed=true')).toBeLessThan(
      rollback.indexOf('render_release_nginx_config "$target_release" "$target_slot"'),
    );
    expect(deploy.indexOf('stop_slot_app_services "$previous_slot"')).toBeGreaterThan(
      deploy.indexOf('set_active_slot "$target_slot"'),
    );
    expect(rollback.indexOf('stop_slot_app_services "$current_slot"')).toBeGreaterThan(
      rollback.indexOf('set_active_slot "$target_slot"'),
    );
  });

  it('keeps production env templates secret-free and splits browser/server marketing credentials', () => {
    const storefrontEnv = readFileSync(
      resolve(workspaceRoot, 'ops/env/storefront.env.example'),
      'utf8',
    );
    const apiEnv = readFileSync(
      resolve(workspaceRoot, 'ops/env/storefront-api.env.example'),
      'utf8',
    );

    expect(storefrontEnv).not.toMatch(/FACEBOOK_ACCESS_TOKEN=.+/);
    expect(storefrontEnv).toContain('AI_PROVIDER=openrouter');
    expect(storefrontEnv).not.toMatch(/NEXT_PUBLIC_TIKTOK_PIXEL_ID=.+/);
    expect(apiEnv).toContain('META_CONVERSIONS_API_TOKEN=replace-with-meta-access-token');
    expect(apiEnv).toContain('GOOGLE_ANALYTICS_API_SECRET=replace-me');
    expect(apiEnv).not.toMatch(/TIKTOK_PIXEL_ID=.+/);
    expect(apiEnv).not.toMatch(/TIKTOK_EVENTS_API_ACCESS_TOKEN=.+/);
  });
});
