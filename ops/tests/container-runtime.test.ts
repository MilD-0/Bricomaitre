import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const productionDockerfiles = [
  {
    path: 'ops/docker/Dockerfile.admin',
    appDirectory: 'apps/admin',
    stages: 4,
    runtimeStages: 3,
  },
  {
    path: 'ops/docker/Dockerfile.storefront-api',
    appDirectory: 'apps/storefront-api',
    stages: 3,
    runtimeStages: 2,
  },
  {
    path: 'ops/docker/Dockerfile.storefront',
    appDirectory: 'apps/storefront',
    stages: 2,
    runtimeStages: 1,
  },
];
const licensedPackageManifests = [
  'package.json',
  'apps/admin/package.json',
  'apps/storefront/package.json',
  'apps/storefront-api/package.json',
  'ops/package.json',
  'packages/ai-core/package.json',
  'packages/db/package.json',
  'packages/runtime/package.json',
  'packages/storefront-core/package.json',
];
const vitestPackages = [
  'apps/admin/package.json',
  'apps/storefront/package.json',
  'apps/storefront-api/package.json',
  'ops/package.json',
  'packages/ai-core/package.json',
  'packages/runtime/package.json',
  'packages/storefront-core/package.json',
];

describe('production packaging and release runtime', () => {
  it.each(vitestPackages)('bounds nested Vitest concurrency in %s', (packagePath) => {
    const packageJson = JSON.parse(readFileSync(resolve(workspaceRoot, packagePath), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const vitestScripts = Object.entries(packageJson.scripts ?? {}).filter(([, script]) =>
      script.includes('vitest'),
    );

    expect(vitestScripts.length).toBeGreaterThan(0);
    expect(vitestScripts.every(([, script]) => /--maxWorkers=(?:1|2)(?:\s|$)/.test(script))).toBe(
      true,
    );
  });

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
    'copies only the app source and release inputs required by $path',
    ({ path, appDirectory }) => {
      const source = readFileSync(resolve(workspaceRoot, path), 'utf8');

      expect(source).not.toMatch(/^COPY [.] [.]$/m);
      expect(source).toContain(`COPY ${appDirectory} ./${appDirectory}`);
      expect(source).toContain('COPY packages/storefront-core ./packages/storefront-core');
      const manifests = new Map(
        licensedPackageManifests.map((manifestPath) => {
          const manifest = JSON.parse(readFileSync(resolve(workspaceRoot, manifestPath), 'utf8'));
          return [manifest.name, { path: manifestPath, ...manifest }];
        }),
      );
      for (const manifest of manifests.values()) {
        if (!source.includes(`COPY ${manifest.path} `)) continue;
        for (const [name, version] of Object.entries({
          ...manifest.dependencies,
          ...manifest.devDependencies,
        })) {
          if (!String(version).startsWith('workspace:')) continue;
          expect(source).toContain(`COPY ${manifests.get(name)?.path} `);
        }
      }
      expect(source).toContain('COPY --chown=bric:bric LICENSE NOTICE SECURITY.md ./');
      expect(source).toContain(
        'COPY --chown=bric:bric third_party/licenses ./third_party/licenses',
      );
      expect(source).toContain(
        'COPY ops/scripts/hydrate-next-standalone.sh ./ops/scripts/hydrate-next-standalone.sh',
      );
      expect(source).toContain(
        'COPY ops/scripts/generate-runtime-license-bundle.mjs ./ops/scripts/generate-runtime-license-bundle.mjs',
      );
      expect(source).toContain('RUNTIME_THIRD_PARTY_LICENSES.txt');
      expect(source).toContain('node ops/scripts/generate-runtime-license-bundle.mjs');
      expect(source).toContain(`bash ops/scripts/hydrate-next-standalone.sh ${appDirectory}`);
      expect(source).toContain('node -e "require(\'next/dist/server/next-server\')"');
    },
  );

  it.each(productionDockerfiles)(
    'publishes AGPL metadata and notices in every runtime stage of $path',
    ({ path, runtimeStages }) => {
      const source = readFileSync(resolve(workspaceRoot, path), 'utf8');

      expect(
        source.match(/org[.]opencontainers[.]image[.]licenses="AGPL-3[.]0-only"/g),
      ).toHaveLength(runtimeStages);
      expect(
        source.match(/COPY --chown=bric:bric LICENSE NOTICE SECURITY[.]md [.][/]/g),
      ).toHaveLength(runtimeStages);
      expect(source.match(/COPY --chown=bric:bric third_party[/]licenses/g)).toHaveLength(
        runtimeStages,
      );
      expect(
        source.match(
          /org[.]opencontainers[.]image[.]source="https:\/\/github[.]com\/MilD-0\/Bricomaitre"/g,
        ),
      ).toHaveLength(runtimeStages);
      expect(source.match(/com[.]bricomaitre[.]repository="MilD-0\/Bricomaitre"/g)).toHaveLength(
        runtimeStages,
      );
      expect(source).not.toContain('Bricomaitre2');
      expect(source).not.toMatch(/Proprietary|com[.]bricomaitre[.]ai-policy/);
    },
  );

  it.each(productionDockerfiles)(
    'removes the unused npm client from every runtime stage of $path',
    ({ path, runtimeStages }) => {
      const source = readFileSync(resolve(workspaceRoot, path), 'utf8');

      expect(source.match(/rm -rf \/usr\/local\/lib\/node_modules\/npm/g)).toHaveLength(
        runtimeStages,
      );
      expect(source.match(/rm -f \/usr\/local\/bin\/npm \/usr\/local\/bin\/npx/g)).toHaveLength(
        runtimeStages,
      );
    },
  );

  it.each(licensedPackageManifests)('declares AGPL-3.0-only in %s', (packagePath) => {
    const packageJson = JSON.parse(readFileSync(resolve(workspaceRoot, packagePath), 'utf8')) as {
      license?: string;
    };

    expect(packageJson.license).toBe('AGPL-3.0-only');
  });

  it('requires isolated production database roles and authenticated Redis', () => {
    const compose = readFileSync(resolve(workspaceRoot, 'ops/docker/compose.prod.yml'), 'utf8');
    const infraExample = readFileSync(resolve(workspaceRoot, 'ops/env/infra.env.example'), 'utf8');
    const adminExample = readFileSync(resolve(workspaceRoot, 'ops/env/admin.env.example'), 'utf8');
    const storefrontApiExample = readFileSync(
      resolve(workspaceRoot, 'ops/env/storefront-api.env.example'),
      'utf8',
    );
    const validator = readFileSync(
      resolve(workspaceRoot, 'ops/scripts/validate-operations.sh'),
      'utf8',
    );
    const roleProvisionerPath = resolve(workspaceRoot, 'ops/docker/postgres/init-roles.sh');
    const roleProvisioner = readFileSync(roleProvisionerPath, 'utf8');
    const deploy = readFileSync(resolve(workspaceRoot, 'ops/scripts/deploy.sh'), 'utf8');
    const release = readFileSync(resolve(workspaceRoot, '.github/workflows/deploy.yml'), 'utf8');

    expect(compose).toContain(
      'POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set in infra.env}',
    );
    expect(compose).not.toContain('POSTGRES_PASSWORD:-change-me');
    expect(infraExample).toMatch(/^POSTGRES_PASSWORD=$/m);
    expect(infraExample).toMatch(/^POSTGRES_ADMIN_PASSWORD=$/m);
    expect(infraExample).toMatch(/^POSTGRES_STOREFRONT_PASSWORD=$/m);
    expect(infraExample).toMatch(/^REDIS_PASSWORD=$/m);
    expect(adminExample).toContain('postgresql://bricadmin_admin:');
    expect(storefrontApiExample).toContain('postgresql://bricadmin_storefront:');
    expect(compose).toContain("'--requirepass'");
    expect(compose).toContain('postgres/init-roles.sh');
    expect(statSync(roleProvisionerPath).mode & 0o111).not.toBe(0);
    expect(release).toContain('"$bundle_dir/ops/docker/postgres"');
    expect(release).toContain('ops/docker/postgres/init-roles.sh');
    expect(release).toContain('test -x "$bundle_dir/ops/docker/postgres/init-roles.sh"');
    expect(roleProvisioner).toContain('WHERE NOT EXISTS (SELECT FROM pg_roles');
    expect(roleProvisioner).toContain('ALTER ROLE :"admin_user" LOGIN PASSWORD');
    expect(roleProvisioner).toContain('ALTER ROLE :"storefront_user" LOGIN PASSWORD');
    expect(roleProvisioner).toContain('GRANT :"owner_user" TO :"admin_user"');
    expect(roleProvisioner).toContain("'public.storefront_order_idempotency'");
    expect(roleProvisioner).toContain("'admin.ecotrack_service_fees'");
    expect(roleProvisioner).toContain('GRANT USAGE ON SCHEMA admin');
    expect(roleProvisioner).toContain(
      'GRANT UPDATE (view_count, add_to_cart_count, checkout_count, purchase_count, popularity_score, conversion_rate, last_viewed_at)',
    );
    expect(roleProvisioner).toContain(
      'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM :"storefront_user"',
    );
    expect(roleProvisioner).not.toContain('GRANT UPDATE ON TABLE public.products');
    expect(roleProvisioner).not.toContain('GRANT UPDATE ON TABLE public.storefront_settings');
    expect(roleProvisioner).not.toContain('GRANT SELECT ON ALL TABLES');
    expect(roleProvisioner).not.toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES');
    expect(roleProvisioner).not.toContain('ALTER DEFAULT PRIVILEGES');
    expect(
      deploy.match(
        /docker exec "\$postgres_container_id" \/docker-entrypoint-initdb[.]d\/10-bric-roles[.]sh/g,
      ),
    ).toHaveLength(2);
    expect(deploy).toContain(
      'docker exec "$postgres_container_id" /docker-entrypoint-initdb.d/10-bric-roles.sh',
    );
    expect(`${infraExample}\n${adminExample}\n${storefrontApiExample}`).not.toContain('change-me');
    expect(validator).toContain(`POSTGRES_PASSWORD='compose-validation-only'`);
    expect(validator).toContain(`REDIS_PASSWORD='compose-validation-redis-only'`);
  });

  it('pins the upstream SheetJS release and its lockfile integrity', () => {
    const adminPackage = JSON.parse(
      readFileSync(resolve(workspaceRoot, 'apps/admin/package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };
    const lockfile = readFileSync(resolve(workspaceRoot, 'pnpm-lock.yaml'), 'utf8');
    const sheetJsUrl = 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz';

    expect(adminPackage.dependencies?.xlsx).toBe(sheetJsUrl);
    expect(lockfile).toContain(`specifier: ${sheetJsUrl}`);
    expect(lockfile).toContain(
      'integrity: sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==',
    );
  });

  it('packages required legal notices and third-party licenses', () => {
    const license = readFileSync(resolve(workspaceRoot, 'LICENSE'), 'utf8');
    const notice = readFileSync(resolve(workspaceRoot, 'NOTICE'), 'utf8');
    const release = readFileSync(resolve(workspaceRoot, '.github/workflows/deploy.yml'), 'utf8');
    const deployVerifier = readFileSync(
      resolve(workspaceRoot, 'ops/scripts/blue-green.sh'),
      'utf8',
    );
    const lockfile = readFileSync(resolve(workspaceRoot, 'pnpm-lock.yaml'), 'utf8');
    const libvipsVersions = JSON.parse(
      readFileSync(
        resolve(workspaceRoot, 'third_party/licenses/SHARP-LIBVIPS-VERSIONS.json'),
        'utf8',
      ),
    ) as { vips?: string };

    expect(license).toContain('GNU AFFERO GENERAL PUBLIC LICENSE');
    expect(license).toContain('Version 3, 19 November 2007');
    expect(notice).toContain('AGPL-3.0-only');
    expect(notice).toContain('EXCLUDED VISUAL IDENTITY');
    expect(notice).toContain('PUBLIC HISTORY');
    expect(notice).toContain('THIRD-PARTY SOFTWARE AND FONTS');

    for (const assetPath of [
      'apps/admin/app/icon.png',
      'apps/admin/app/apple-icon.png',
      'apps/admin/app/favicon.ico',
      'apps/admin/public/android-chrome-192x192.png',
      'apps/admin/public/android-chrome-512x512.png',
      'apps/admin/public/favicon-16x16.png',
      'apps/admin/public/favicon-32x32.png',
      'apps/admin/public/favicon-48x48.png',
      'apps/admin/public/mask-icon-512.png',
      'apps/storefront/public/logo.png',
      'apps/storefront/app/icon.png',
      'apps/storefront/app/apple-icon.png',
      'apps/storefront/app/favicon.ico',
      'apps/storefront/public/icons/icon-192.png',
      'apps/storefront/public/icons/icon-512.png',
      'apps/storefront/public/icons/icon-maskable-512.png',
    ]) {
      expect(notice).toContain(assetPath);
      expect(existsSync(resolve(workspaceRoot, assetPath))).toBe(true);
    }

    for (const releaseFile of ['LICENSE', 'NOTICE', 'SECURITY.md']) {
      expect(release).toContain(releaseFile);
      expect(deployVerifier).toContain(`$release_dir/${releaseFile}`);
    }
    expect(release).toContain('rsync -a third_party/licenses/');
    expect(deployVerifier).toContain(
      'warning: accepting a retained legacy release for rollback compatibility',
    );

    expect(lockfile).toContain("'@img/sharp-libvips-linux-x64@1.3.3'");
    expect(lockfile).toContain("'@fontsource-variable/inter@5.3.0'");
    expect(lockfile).toContain("'@fontsource/ibm-plex-sans-arabic@5.3.0'");
    expect(libvipsVersions.vips).toBe('8.18.6');
    expect(notice).toContain('sharp-libvips/tree/v1.3.3');
    expect(notice).toContain('libvips/tree/v8.18.6');
  });

  it('allows production releases only after successful trusted main CI and complete image builds', () => {
    const ci = parse(readFileSync(resolve(workspaceRoot, '.github/workflows/ci.yml'), 'utf8'));
    const release = parse(
      readFileSync(resolve(workspaceRoot, '.github/workflows/deploy.yml'), 'utf8'),
    );
    expect(ci.on.pull_request.branches).toContain('main');
    expect(ci.on.pull_request_target).toBeUndefined();
    expect(ci.permissions).toEqual({ contents: 'read' });
    expect(ci.concurrency['cancel-in-progress']).toBe(true);
    expect(release.on.workflow_run).toEqual({
      workflows: ['CI'],
      types: ['completed'],
      branches: ['main'],
    });
    const selection = release.jobs['release-context'];
    for (const restriction of [
      "github.event.workflow_run.conclusion == 'success'",
      "github.event.workflow_run.event == 'push'",
      "github.event.workflow_run.head_branch == 'main'",
      'github.event.workflow_run.head_repository.full_name == github.repository',
    ])
      expect(selection.if).toContain(restriction);
    const buildJobs = ['build-api-images', 'build-admin-images', 'build-storefront-image'];
    for (const name of buildJobs) {
      const job = release.jobs[name];
      expect(job.needs).toBe('release-context');
      expect(job.if).toBe("needs.release-context.outputs.current == 'true'");
      expect(job.env.IMAGE_REVISION).toBe('${{ needs.release-context.outputs.sha }}');
      expect(job.permissions).toEqual({ contents: 'read', 'id-token': 'write', packages: 'write' });
    }
    expect(release.jobs['assemble-release-manifest'].needs).toEqual([
      'release-context',
      ...buildJobs,
    ]);
    const deploy = release.jobs.deploy;
    expect(deploy.needs).toEqual(['release-context', 'assemble-release-manifest']);
    expect(deploy.concurrency).toEqual({
      group: 'bricomaitre-production',
      'cancel-in-progress': false,
    });
    expect(deploy.environment.name).toBe('production');
    expect(deploy.permissions).toEqual({ contents: 'read', packages: 'read' });
    const gates = Object.keys(ci.jobs).filter((name) => name !== 'required');
    expect([...ci.jobs.required.needs].sort()).toEqual(gates.sort());
    expect(ci.jobs.required.if).toBe('${{ always() }}');
    const rejection = ci.jobs.required.steps.find(
      (step: { run?: string }) => step.run === 'exit 1',
    );
    expect(rejection.if).toContain("contains(needs.*.result, 'failure')");
    expect(rejection.if).toContain("contains(needs.*.result, 'cancelled')");
  });

  it('pins external workflow actions and grants persistent Git credentials only for release freshness reads', () => {
    for (const filename of ['ci.yml', 'deploy.yml']) {
      const source = readFileSync(resolve(workspaceRoot, '.github/workflows', filename), 'utf8');
      const workflow = parse(source);
      if (filename === 'ci.yml') expect(source).not.toMatch(/secrets\./);
      for (const [jobName, job] of Object.entries(workflow.jobs) as [
        string,
        { steps: { uses?: string; with?: Record<string, unknown> }[] },
      ][]) {
        for (const step of job.steps) {
          if (!step.uses || step.uses.startsWith('./')) continue;
          expect(step.uses, jobName).toMatch(/@[a-f0-9]{40}$/);
          if (step.uses.startsWith('actions/checkout@')) {
            const needsFreshnessRead =
              filename === 'deploy.yml' && ['release-context', 'deploy'].includes(jobName);
            expect(step.with?.['persist-credentials'], jobName).toBe(needsFreshnessRead);
          }
        }
      }
    }
  });

  it('keeps dependency pins on schedule', () => {
    const dependabot = readFileSync(resolve(workspaceRoot, '.github/dependabot.yml'), 'utf8');

    expect(dependabot).toContain('package-ecosystem: github-actions');
    expect(dependabot).toContain('package-ecosystem: docker');
    expect(dependabot.match(/interval: monthly/g)).toHaveLength(3);
    expect(dependabot).toContain('open-pull-requests-limit: 5');
  });

  it('uses durable local BuildKit caches, OCI identity, and grouped Bake builds', () => {
    const bake = readFileSync(resolve(workspaceRoot, 'ops/docker/docker-bake.hcl'), 'utf8');
    const dockerfiles = productionDockerfiles.map(({ path }) =>
      readFileSync(resolve(workspaceRoot, path), 'utf8'),
    );

    expect(bake).toContain('group "api"');
    expect(bake).toContain('group "admin"');
    expect(bake).toContain('group "storefront"');
    expect(bake).not.toContain('cache-from');
    expect(bake).not.toContain('cache-to');
    expect(bake).not.toContain('type=registry');
    for (const dockerfile of dockerfiles) {
      expect(dockerfile).toContain(
        '--mount=type=cache,id=bricomaitre-pnpm-store-v11,target=/pnpm/store,sharing=shared',
      );
      expect(dockerfile).toContain('ENV COREPACK_HOME="/corepack"');
      expect(dockerfile).toContain(
        '--mount=type=cache,id=bricomaitre-corepack-pnpm-11.24.0,target=/corepack,sharing=shared',
      );
      expect(dockerfile).toContain('npm_config_store_dir=/pnpm/store');
      expect(dockerfile).toContain('npm_config_prefer_offline=true');
      expect(dockerfile).toContain('npm_config_fetch_retries=8');
      expect(dockerfile).toContain('npm_config_fetch_retry_maxtimeout=60000');
    }
    expect(dockerfiles[0]).toContain(
      '--mount=type=cache,id=bricomaitre-admin-next-build,target=/workspace/apps/admin/.next/cache,sharing=locked',
    );
    expect(dockerfiles[1]).toContain(
      '--mount=type=cache,id=bricomaitre-storefront-api-next-build,target=/workspace/apps/storefront-api/.next/cache,sharing=locked',
    );
    expect(dockerfiles[2]).toContain(
      '--mount=type=cache,id=bricomaitre-storefront-next-build,target=/workspace/apps/storefront/.next/cache,sharing=locked',
    );
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
