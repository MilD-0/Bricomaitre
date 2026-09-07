import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('production packaging and release runtime', () => {
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

  it('bounds every long-running application process', () => {
    const compose = parse(
      readFileSync(resolve(workspaceRoot, 'ops/docker/compose.prod.yml'), 'utf8'),
    );
    for (const name of [
      'x-storefront-api-blue',
      'x-storefront-meta-worker',
      'x-admin-blue',
      'x-admin-worker-blue',
      'x-storefront-blue',
    ]) {
      const definition = compose[name];
      expect(definition.init, name).toBe(true);
      const pids = String(definition.pids_limit).replace(/^\$\{[^:]+:-(\d+)\}$/, '$1');
      expect(Number(pids), name).toBeGreaterThan(0);
      expect(definition.stop_grace_period, name).toBe('30s');
      expect(definition.healthcheck.test, name).toBeDefined();
    }
  });

  it.each(['x-admin-worker-blue', 'x-storefront-meta-worker'])(
    'executes the deployed heartbeat check for %s',
    (name) => {
      const compose = parse(
        readFileSync(resolve(workspaceRoot, 'ops/docker/compose.prod.yml'), 'utf8'),
      );
      const [kind, command] = compose[name].healthcheck.test;
      expect(kind).toBe('CMD-SHELL');
      const source = command.match(/^node -e "([\s\S]+)"$/)?.[1];
      expect(source).toBeTruthy();
      const now = 1_000_000;
      for (const [timestamp, expectedCode] of [
        [now, 0],
        [now - 45_000, 0],
        [now - 45_001, 1],
        [now + 1, 1],
        ['invalid', 1],
      ] as const) {
        const signals: unknown[][] = [];
        let exitCode: number | undefined;
        const exit = new Error('process exited');
        expect(() =>
          runInNewContext(source!, {
            Date: { now: () => now },
            require: (module: string) => {
              expect(module).toBe('node:fs');
              return { existsSync: () => true, readFileSync: () => String(timestamp) };
            },
            process: {
              exit: (code: number) => {
                exitCode = code;
                throw exit;
              },
              kill: (...args: unknown[]) => signals.push(args),
            },
          }),
        ).toThrow(exit);
        expect(exitCode).toBe(expectedCode);
        expect(signals).toEqual(expectedCode === 1 ? [[1, 'SIGTERM']] : []);
      }
    },
  );

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
    const blueGreen = [
      'blue-green.sh',
      'blue-green/runtime.sh',
      'blue-green/nginx.sh',
      'blue-green/release.sh',
      'blue-green/transactions.sh',
    ]
      .map((file) => readFileSync(resolve(workspaceRoot, 'ops/scripts', file), 'utf8'))
      .join('\n');

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
    const blueGreen = [
      'blue-green.sh',
      'blue-green/runtime.sh',
      'blue-green/nginx.sh',
      'blue-green/release.sh',
      'blue-green/transactions.sh',
    ]
      .map((file) => readFileSync(resolve(workspaceRoot, 'ops/scripts', file), 'utf8'))
      .join('\n');
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
    const dockerDaemon = readFileSync(
      resolve(workspaceRoot, 'ops/host/docker-daemon.json'),
      'utf8',
    );
    const sshHardening = readFileSync(
      resolve(workspaceRoot, 'ops/host/00-bricomaitre-hardening.conf'),
      'utf8',
    );
    const storefrontMemoryService = readFileSync(
      resolve(workspaceRoot, 'ops/host/bricomaitre-storefront-memory.service'),
      'utf8',
    );
    const storefrontMemoryTimer = readFileSync(
      resolve(workspaceRoot, 'ops/host/bricomaitre-storefront-memory.timer'),
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
    expect(dockerDaemon).toContain('"live-restore": true');
    expect(installer).toContain('dockerd --validate');
    expect(installer).toContain('systemctl reload docker');
    expect(installer).toContain("'{{.LiveRestoreEnabled}}'");
    expect(sshHardening).toContain('DisableForwarding yes');
    expect(sshHardening).toContain('AllowAgentForwarding no');
    expect(sshHardening).toContain('AllowTcpForwarding no');
    expect(sshHardening).toContain('X11Forwarding no');
    expect(installer).toContain('sshd -t');
    expect(installer).toContain('systemctl reload ssh');
    expect(installer).toContain('bricomaitre-storefront-memory.timer');
    expect(installer).toContain('systemctl start bricomaitre-storefront-memory.service');
    expect(storefrontMemoryService).toContain(
      '/usr/local/libexec/bricomaitre/check-storefront-memory.sh',
    );
    expect(storefrontMemoryService).toContain('User={{OPERATIONS_USER}}');
    expect(storefrontMemoryTimer).toContain('OnUnitActiveSec=5min');
    expect(storefrontMemoryTimer).toContain('Persistent=true');
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
      'curl --fail --silent --show-error --resolve "${BRIC_API_DOMAIN:-api.example.com}:443:127.0.0.1"',
    );
    expect(compose).toContain(
      'curl --fail --silent --show-error --resolve "${BRIC_STOREFRONT_DOMAIN:-www.example.com}:443:127.0.0.1"',
    );
    expect(compose).not.toContain('--insecure');
    expect(
      readFileSync(resolve(workspaceRoot, 'ops/scripts/smoke-check.sh'), 'utf8'),
    ).not.toContain('--insecure');
    expect(nginx).toContain('$request_method $bric_log_uri $server_protocol');
    expect(nginx).toContain('$1/[redacted]');
    expect(nginx).toContain('$request_id $remote_addr');
    expect(nginx).toContain('proxy_cache_path /var/cache/nginx/storefront-images');
    expect(nginx).toContain('max_size=384m');
    expect(nginx).toContain('text/x-component');
    expect(nginx).not.toContain('"$request"');
    expect(nginx).not.toContain('$http_referer');
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
