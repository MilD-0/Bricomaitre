import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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
      expect(source).not.toContain('ops/ownership');
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

  it('keeps source-verification builds isolated from production services', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(workspaceRoot, 'package.json'), 'utf8'),
    ) as {
      scripts?: Record<string, string>;
    };
    const buildScript = readFileSync(
      resolve(workspaceRoot, 'ops/scripts/build-public-apps.sh'),
      'utf8',
    );

    expect(packageJson.scripts?.['build:verify']).toBe('bash ops/scripts/build-public-apps.sh');
    expect(buildScript).toContain("fixture_origin='http://127.0.0.1:4311'");
    expect(buildScript).toContain('node apps/storefront/test/fixture-storefront-api.mjs');
    expect(buildScript).toContain('export STOREFRONT_API_BASE_URL="$fixture_origin"');
    expect(buildScript).toContain(
      'export NEXT_PUBLIC_STOREFRONT_IMAGE_ORIGINS="http://127.0.0.1:3003,$fixture_origin"',
    );
    expect(buildScript).toContain("STOREFRONT_API_TIMEOUT_MS='1000'");
    expect(buildScript).toContain("SENTRY_AUTH_TOKEN=''");
    expect(buildScript).toContain('pnpm build:apps');
    expect(buildScript).toContain('pnpm --filter @bric/storefront build');
    expect(buildScript).not.toContain('api.bricomaitre.com');
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

  it('packages the public legal surface instead of legacy ownership boundaries', () => {
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
    expect(release).not.toContain('ops/ownership');
    expect(release).not.toContain('AI_AGENT_BOUNDARY');
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

  it('prints candidate state and bounded logs when a health gate expires', () => {
    const healthGate = readFileSync(
      resolve(workspaceRoot, 'ops/scripts/wait-for-health.sh'),
      'utf8',
    );

    expect(healthGate).toContain('oom={{.State.OOMKilled}}');
    expect(healthGate).toContain('docker logs --tail 100 "$container_id"');
  });

  it('does not derive release validity from cache-sensitive build progress logs', () => {
    const release = readFileSync(resolve(workspaceRoot, '.github/workflows/deploy.yml'), 'utf8');
    const deploy = readFileSync(resolve(workspaceRoot, 'ops/scripts/deploy.sh'), 'utf8');
    const manifest = readFileSync(
      resolve(workspaceRoot, 'ops/scripts/assemble-release-image-manifest.mjs'),
      'utf8',
    );

    expect(`${release}\n${deploy}\n${manifest}`).not.toContain('BRIC_STOREFRONT_STATIC_PAGES');
    expect(release).not.toContain('extract-static-page-count.py');
    expect(release).toContain('bash ops/scripts/build-release-images.sh');
    expect(release).toContain('bash ops/scripts/sign-bake-images.sh');
    expect(release).toContain(
      'BRIC_RELEASE_SIGNER_IDENTITY=https://github.com/${GITHUB_REPOSITORY}/.github/workflows/deploy.yml@refs/heads/main',
    );
    expect(deploy).toContain('bash "$script_dir/smoke-check.sh"');
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

    for (const [job, nextJob] of [
      ['build-api-images', 'build-admin-images'],
      ['build-admin-images', 'build-storefront-image'],
      ['build-storefront-image', 'assemble-release-manifest'],
    ]) {
      const imageJob = release.slice(
        release.indexOf(`  ${job}:`),
        release.indexOf(`\n  ${nextJob}:`),
      );

      expect(imageJob).toContain('name: Isolate Docker registry credentials');
      expect(imageJob).toContain('docker_config="$RUNNER_TEMP/docker-config"');
      expect(imageJob).toContain('echo "DOCKER_CONFIG=$docker_config"');
      expect(imageJob).toContain('echo "BUILDX_CONFIG=$HOME/.docker/buildx"');
      expect(imageJob.indexOf('name: Isolate Docker registry credentials')).toBeLessThan(
        imageJob.indexOf('docker/setup-buildx-action@'),
      );
    }

    const selfHostedRunnerSelector = 'runs-on: [self-hosted, Linux, X64, bricomaitre-ci]';
    const hostedRunnerSelector = 'runs-on: ubuntu-24.04';
    expect(ci.split(selfHostedRunnerSelector)).toHaveLength(9);
    expect(release.split(selfHostedRunnerSelector)).toHaveLength(7);
    expect(ci).not.toContain(hostedRunnerSelector);
    expect(release).not.toContain(hostedRunnerSelector);
    expect(ci).not.toContain('services:');
    expect(ci).not.toContain('55432:5432');
    expect(ci).not.toContain('56379:6379');
    expect(ci).not.toContain('55433:5432');
    expect(ci).not.toContain('56380:6379');
    expect(ci).toContain('127.0.0.1:55433/bricomaitre_browser');
    expect(ci).toContain('127.0.0.1:56380/0');

    const serviceContracts = ci.slice(ci.indexOf('  service-contracts:'), ci.indexOf('\n  tests:'));
    expect(serviceContracts).toContain(
      'bash ops/scripts/run-service-contract-tests.sh 55432 56379 bricomaitre_test',
    );
    const serviceContractRunner = readFileSync(
      resolve(workspaceRoot, 'ops/scripts/run-service-contract-tests.sh'),
      'utf8',
    );
    expect(serviceContractRunner).toContain('127.0.0.1:${postgres_port}/${database}');
    expect(serviceContractRunner).toContain('127.0.0.1:${redis_port}/0');
    expect(serviceContractRunner).toContain(
      'ops/scripts/run-with-ci-services.sh "$postgres_port" "$redis_port" "$database"',
    );
    expect(serviceContractRunner).toContain(
      'configure-postgres-autovacuum.sh "$BRIC_CI_POSTGRES_CONTAINER" "$BRIC_CI_POSTGRES_PORT"',
    );
    expect(serviceContractRunner).toContain('pnpm --filter @bric/admin test:services');
    const workspacePackage = JSON.parse(
      readFileSync(resolve(workspaceRoot, 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    const adminPackage = JSON.parse(
      readFileSync(resolve(workspaceRoot, 'apps/admin/package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    expect(workspacePackage.scripts['test:services']).toBe(
      'bash ops/scripts/run-service-contract-tests.sh',
    );
    expect(workspacePackage.scripts['test:ci']).toContain('pnpm test:services');
    expect(adminPackage.scripts['test:services']).toContain(
      '--project service-integration-node --project redis-integration-node --maxWorkers=1',
    );

    const storefrontBrowser = ci.slice(
      ci.indexOf('  browser-acceptance:'),
      ci.indexOf('\n  admin-browser-acceptance:'),
    );
    expect(storefrontBrowser).toContain('BRIC_PLAYWRIGHT_SERVER: prebuilt');
    expect(storefrontBrowser).toContain('bash ops/scripts/build-public-apps.sh storefront');
    expect(storefrontBrowser).toContain('continue-on-error: true');
    expect(
      storefrontBrowser.indexOf('name: Build Storefront for browser acceptance'),
    ).toBeGreaterThan(0);
    expect(storefrontBrowser.indexOf('name: Build Storefront for browser acceptance')).toBeLessThan(
      storefrontBrowser.indexOf('name: Run browser acceptance tests'),
    );

    const adminBrowser = ci.slice(
      ci.indexOf('  admin-browser-acceptance:'),
      ci.indexOf('\n  browser-performance:'),
    );
    expect(adminBrowser).toContain(
      'ops/scripts/run-with-ci-services.sh 55433 56380 bricomaitre_browser',
    );
    expect(adminBrowser).toContain('127.0.0.1:55433/bricomaitre_browser');
    expect(adminBrowser).toContain('127.0.0.1:56380/0');
    expect(adminBrowser).toContain('Configure ephemeral Admin browser state');
    expect(adminBrowser).toContain('BRIC_PLAYWRIGHT_SERVER: prebuilt');
    expect(adminBrowser).toContain('continue-on-error: true');
    expect(adminBrowser.indexOf('name: Build Admin for browser acceptance')).toBeGreaterThan(0);
    expect(adminBrowser.indexOf('name: Build Admin for browser acceptance')).toBeLessThan(
      adminBrowser.indexOf('name: Run Admin browser acceptance tests'),
    );
    expect(adminBrowser).toContain(
      "printf 'ADMIN_PLAYWRIGHT_STORAGE_STATE=%s/admin-playwright-auth.json\\n'",
    );
    expect(adminBrowser).toContain('"$RUNNER_TEMP" >> "$GITHUB_ENV"');
    expect(adminBrowser).not.toContain('apps/admin/test-results/auth.json');
    expect(adminBrowser).toContain('BETTER_AUTH_URL: http://127.0.0.1:3020');
    expect(adminBrowser).toContain('BRIC_PLAYWRIGHT_ADMIN_ORIGIN: http://127.0.0.1:3020');

    expect(ci).toContain('name: CI / Required');
    expect(ci).toContain('cancel-in-progress: true');
    expect(ci).toContain('fail-fast: false');
    const productionBuilds = ci.slice(
      ci.indexOf('  production-builds:'),
      ci.indexOf('\n  required:'),
    );
    expect(productionBuilds).toContain('ops/scripts/run-loopback-isolated.sh pnpm build:verify');
    expect(productionBuilds).not.toContain('api.bricomaitre.com');
    expect(ci).toContain("if: github.event_name == 'workflow_dispatch'");
    expect(ci).toContain('ops/scripts/run-loopback-isolated.sh pnpm test:storefront:browser');
    expect(ci).not.toContain('pnpm test:storefront:browser --workers=2');
    expect(ci).toContain(
      'ops/scripts/run-ci-check.sh "Admin browser acceptance tests" pnpm test:admin:browser',
    );
    expect(ci).not.toContain('pnpm test:admin:browser --workers=2');
    expect(ci).toContain('ops/scripts/run-loopback-isolated.sh pnpm test:storefront:performance');
    expect(ci.match(/ops[/]scripts[/]run-loopback-isolated[.]sh/g)).toHaveLength(4);
    expect(ci.match(/ops[/]scripts[/]run-with-ci-services[.]sh/g)).toHaveLength(1);
    expect(release).toContain('workflow_run:');
    expect(release).toMatch(/workflow_run:[\s\S]*branches:\s+- main/);
    expect(release).not.toContain('pull-requests: read');
    expect(release).not.toContain('verify-release-pr.sh');
    expect(release).toContain('--build-state "$PWD" "$RELEASE_SHA"');
    expect(release).toContain('"$bundle_dir/.bric-migrations.json"');
    expect(release).toContain('group: bricomaitre-production');
    expect(release).toContain('cancel-in-progress: false');
    expect(release).toContain('ssh_dir="$RUNNER_TEMP/bric-deploy-ssh"');
    expect(release).toContain('UserKnownHostsFile %s\\n');
    expect(release).toContain('StrictHostKeyChecking yes\\n');
    expect(release).toContain('ServerAliveInterval 15\\n');
    expect(release).toContain('ServerAliveCountMax 4\\n');
    expect(release).toContain('echo "BRIC_DEPLOY_SSH_CONFIG=$ssh_config"');
    expect(release.match(/ssh -F "\$BRIC_DEPLOY_SSH_CONFIG" bric-production/g)).toHaveLength(11);
    expect(release).not.toContain('~/.ssh/bric_deploy_key');
    expect(release).not.toContain('> ~/.ssh/known_hosts');
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
    expect(workspaceSetup).toContain('next_cache_root="$BRIC_CI_CACHE_DIR/next/$runner_cache_key"');
    expect(workspaceSetup).toContain('apps/admin/.next/dev/cache/turbopack');
    expect(workspaceSetup).toContain('apps/storefront/.next/dev/cache/turbopack');
    expect(workspaceSetup).toContain('apps/storefront/.next/cache');
    expect(workspaceSetup).toContain('mv "$source_path" "$target_path"');
    expect(workspaceSetup).toContain('ln -s "$target_path" "$source_path"');
    expect(workspaceSetup.indexOf('Configure persistent host caches')).toBeLessThan(
      workspaceSetup.indexOf('Clean generated workspace state'),
    );
    const actionReferences = [
      ...`${ci}\n${release}\n${workspaceSetup}`.matchAll(/^\s*-?\s*uses:\s+([^\s#]+)/gm),
    ].map(([, reference]) => reference);
    expect(ci).toMatch(/^\s*pull_request:\n\s+branches:\n\s+- main/m);
    expect(ci).not.toMatch(/^\s*pull_request_target:/m);
    expect(ci).not.toMatch(/secrets\./);
    expect(release).toContain("github.event.workflow_run.event == 'push'");
    expect(ci).not.toContain('github.event.pull_request');
    expect(ci).toContain("if: github.event_name == 'workflow_dispatch'");
    expect(actionReferences.length).toBeGreaterThan(0);
    expect(
      actionReferences.every(
        (reference) =>
          reference.startsWith('./.github/actions/') || /@[a-f0-9]{40}$/.test(reference),
      ),
    ).toBe(true);
    expect(ci.match(/uses: [.][/][.]github[/]actions[/]setup-workspace/g)).toHaveLength(7);
    expect(ci.match(/clean: false/g)).toHaveLength(7);
    expect(ci).toContain(
      'uses: docker/setup-buildx-action@bb05f3f5519dd87d3ba754cc423b652a5edd6d2c',
    );
    expect(`${ci}\n${release}`.match(/name: bricomaitre-ci/g)).toHaveLength(4);
    expect(`${ci}\n${release}`.match(/driver-opts: network=host/g)).toHaveLength(4);
    expect(`${ci}\n${release}`.match(/keep-state: true/g)).toHaveLength(4);
    expect(`${ci}\n${release}`.match(/cache-binary: false/g)).toHaveLength(4);
    expect(`${ci}\n${release}`.match(/cleanup: false/g)).toHaveLength(4);
    expect(release).not.toContain('sigstore/cosign-installer');
    expect(release.match(/bash ops[/]scripts[/]install-cosign[.]sh/g)).toHaveLength(3);
    expect(release.match(/bash ops[/]scripts[/]build-release-images[.]sh/g)).toHaveLength(3);
    const cosignInstaller = readFileSync(
      resolve(workspaceRoot, 'ops/scripts/install-cosign.sh'),
      'utf8',
    );
    expect(cosignInstaller).toContain("cosign_version='v3.0.6'");
    expect(cosignInstaller).toContain(
      "cosign_sha256='c956e5dfcac53d52bcf058360d579472f0c1d2d9b69f55209e256fe7783f4c74'",
    );
    expect(cosignInstaller).toContain('exec 9>"$cache_root/cosign/.install.lock"');
    expect(cosignInstaller).toContain('flock 9');
    expect(cosignInstaller).toContain('--continue-at -');
    expect(cosignInstaller).toContain('--retry-all-errors');
    expect(cosignInstaller).toContain('--retry-max-time 900');
    expect(cosignInstaller).toContain('sha256sum -c --status');
    expect(cosignInstaller).toContain('>> "$GITHUB_PATH"');
    const imageBuilder = readFileSync(
      resolve(workspaceRoot, 'ops/scripts/build-release-images.sh'),
      'utf8',
    );
    expect(imageBuilder).toContain('BRIC_BUILD_MAX_ATTEMPTS:-3');
    expect(imageBuilder).toContain('BRIC_BUILD_RETRY_DELAY_SECONDS:-5');
    expect(imageBuilder).toContain('docker buildx bake');
    expect(imageBuilder).toContain('Release image build failed with a non-network error');
    expect(imageBuilder).toContain('i/o timeout|TLS handshake timeout|connection reset by peer');
    const imageSigner = readFileSync(
      resolve(workspaceRoot, 'ops/scripts/sign-bake-images.sh'),
      'utf8',
    );
    expect(imageSigner).toContain('BRIC_SIGN_MAX_ATTEMPTS:-3');
    expect(imageSigner).toContain('BRIC_SIGN_RETRY_DELAY_SECONDS:-5');
    expect(imageSigner).toContain('--retry-all-errors');
    expect(imageSigner).toContain('tuf refresh failed');
    expect(imageSigner).toContain('failed with a non-network error; not retrying');
    expect(imageSigner).toContain('exhausted $max_attempts transient-network attempts');
    expect(ci.indexOf('uses: docker/setup-buildx-action@')).toBeLessThan(
      ci.indexOf('run: bash ops/scripts/validate-operations.sh'),
    );
    expect(workspaceSetup).not.toContain('pnpm/action-setup');
    expect(workspaceSetup).toContain('package-manager-cache: false');
    expect(workspaceSetup).toContain('corepack_cache_dir="$ci_cache_dir/corepack"');
    expect(workspaceSetup).toContain("printf 'COREPACK_HOME=%s\\n'");
    expect(workspaceSetup).toContain('corepack enable pnpm');
    expect(workspaceSetup).toContain('corepack pnpm --version');
    expect(workspaceSetup).toContain('exec 9>"$BRIC_CI_CACHE_DIR/corepack.lock"');
    expect(workspaceSetup).toContain('git reset --hard HEAD');
    expect(workspaceSetup).toContain('git clean -ffdx -e node_modules/');
    expect(workspaceSetup).not.toContain('-e .cache/');
    expect(workspaceSetup).toContain('playwright_cache_dir="$cache_home/ms-playwright"');
    expect(workspaceSetup).toContain("printf 'BRIC_CI_CACHE_DIR=%s\\n'");
    expect(workspaceSetup).toContain("printf 'PLAYWRIGHT_BROWSERS_PATH=%s\\n'");
    expect(ci).not.toContain('PLAYWRIGHT_BROWSERS_PATH: ${{ github.workspace }}');
    expect(ci.match(/bash ops[/]scripts[/]install-playwright-chromium[.]sh/g)).toHaveLength(3);
    const playwrightInstaller = readFileSync(
      resolve(workspaceRoot, 'ops/scripts/install-playwright-chromium.sh'),
      'utf8',
    );
    expect(playwrightInstaller).toContain('exec 9>"$playwright_cache_dir/.install.lock"');
    expect(playwrightInstaller).toContain('flock 9');
    expect(playwrightInstaller).toContain("RUNNER_ENVIRONMENT:-}\" == 'github-hosted'");
    expect(playwrightInstaller).toContain('install_arguments=(install chromium)');
    expect(playwrightInstaller).toContain('install_arguments=(install --with-deps chromium)');
    expect(playwrightInstaller).toContain('exec playwright "${install_arguments[@]}"');
    const loopbackRunner = readFileSync(
      resolve(workspaceRoot, 'ops/scripts/run-loopback-isolated.sh'),
      'utf8',
    );
    expect(loopbackRunner).toContain("RUNNER_ENVIRONMENT:-}\" == 'github-hosted'");
    expect(loopbackRunner).toContain('sudo --preserve-env unshare --net');
    expect(loopbackRunner).toContain('export HOME="$3" PATH="$4"');
    expect(loopbackRunner).toContain('setpriv --reuid');
    expect(loopbackRunner).toContain('unshare --user --map-root-user --net');
    expect(loopbackRunner).toContain('ip link set lo up');
    const serviceRunner = readFileSync(
      resolve(workspaceRoot, 'ops/scripts/run-with-ci-services.sh'),
      'utf8',
    );
    expect(serviceRunner.match(/--network host/g)).toHaveLength(2);
    expect(serviceRunner).toContain('docker image inspect "$image"');
    expect(serviceRunner).toContain('docker-images.lock');
    expect(serviceRunner).toContain('flock 9');
    expect(serviceRunner).toContain('docker pull "$image"');
    expect(serviceRunner).toContain('docker rm --force');
    expect(ci).toContain('BRIC_PLAYWRIGHT_STOREFRONT_ORIGIN: http://127.0.0.1:3013');
    expect(ci).toContain('BRIC_PLAYWRIGHT_UPSTREAM_ORIGIN: http://127.0.0.1:3014');
    expect(ci).toContain('BRIC_PLAYWRIGHT_FIXTURE_API_ORIGIN: http://127.0.0.1:4321');
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
    expect(release).toContain('(SENTRY|NEXT_PUBLIC_SENTRY)_[A-Z0-9_]+_STOREFRONT_NEW');
    expect(release).toContain(
      'TIKTOK_EVENTS_API_ACCESS_TOKEN: ${{ secrets.TIKTOK_EVENTS_API_ACCESS_TOKEN }}',
    );
    expect(release).toContain(
      'TikTok destination requires both pixel ID and Events API access token',
    );
    expect(release).toContain('MARKETING_GOOGLE_DESTINATION_ENABLED=true');
    expect(release).toContain('MARKETING_TIKTOK_DESTINATION_ENABLED=%s');
  });

  it('keeps dependency pins on schedule', () => {
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
    expect(validator).toContain('download_with_retry()');
    expect(validator).toContain('download_from_cache()');
    expect(validator.match(/download_from_cache \\/g)).toHaveLength(2);
    expect(validator).toContain('download_cache_dir="$cache_root/downloads"');
    expect(validator).toContain('exec {cache_lock_fd}>"$cache_path.lock"');
    expect(validator).toContain('sha256sum -c --status');
    expect(validator).toContain('--retry-all-errors');
    expect(validator).toContain('--connect-timeout 20');
    expect(validator).toContain('--max-time 180');
    expect(validator).toContain(
      '"$shellcheck_bin" --external-sources --source-path=SCRIPTDIR "${shell_scripts[@]}"',
    );
    expect(validator).toContain('build_check_max_attempts=3');
    expect(validator).toContain('BuildKit registry metadata check hit a transient network error');
    expect(validator).toContain('i/o timeout|TLS handshake timeout|connection reset by peer');
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
    expect(deploy).toContain('env -u REDISCLI_AUTH redis-cli --raw ping');
    expect(deploy).toContain('CONFIG SET requirepass "$REDISCLI_AUTH"');
    expect(deploy).toContain('authenticated_redis_ping');
    expect(deploy).toContain('reconcile_incumbent_slot');
    expect(deploy).toContain('compose up -d --no-deps --force-recreate "$previous_api_service"');
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
    expect(deploy).toContain('apply_release_images "$target_slot" "$release_images_file"');
    expect(rollback).toContain(
      'apply_release_images "$target_slot" "$release_images_file" "$verified_release_image_profile"',
    );
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
