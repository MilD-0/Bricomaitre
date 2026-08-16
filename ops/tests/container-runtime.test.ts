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

describe('production container Node.js runtime', () => {
  it.each(productionDockerfiles)(
    'pins every stage in $path to Node.js 24 on Bookworm',
    ({ path, stages }) => {
      const source = readFileSync(resolve(workspaceRoot, path), 'utf8');
      const nodeStages = source.match(/^FROM node:[^\s]+ AS [^\s]+$/gm) ?? [];

      expect(nodeStages).toHaveLength(stages);
      expect(nodeStages.every((line) => /^FROM node:24-bookworm-slim AS /.test(line))).toBe(true);
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
    },
  );

  it('runs each parallel image family and manifest assembly on Node.js 24', () => {
    const workflow = readFileSync(resolve(workspaceRoot, '.github/workflows/deploy.yml'), 'utf8');
    const imagePipeline = workflow.slice(
      workflow.indexOf('  build-api-images:'),
      workflow.indexOf('  deploy:'),
    );

    for (const job of [
      'build-api-images',
      'build-admin-images',
      'build-storefront-image',
      'assemble-release-manifest',
    ]) {
      expect(workflow).toContain(`  ${job}:`);
    }
    for (const job of [
      'static-quality',
      'service-contracts',
      'test-suite',
      'browser-tests',
      'production-builds',
    ]) {
      expect(workflow).toContain(`  ${job}:`);
    }
    expect(imagePipeline.match(/node-version: 24/g)).toHaveLength(4);
    expect(workflow).toContain('    needs: assemble-release-manifest');
    expect(workflow).toContain(
      'pnpm --filter @bric/storefront exec playwright install --with-deps chromium',
    );
    expect(workflow).toContain(
      'ops/scripts/run-ci-check.sh "Storefront browser acceptance tests" pnpm test:storefront:browser',
    );
    expect(workflow).toContain(
      'ops/scripts/run-ci-check.sh "Storefront performance budgets" pnpm test:storefront:performance',
    );
    expect(workflow).toContain('  pull_request:');
    expect(
      workflow.match(
        /if: github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'/g,
      ),
    ).toHaveLength(3);
    expect(workflow.match(/persist-credentials: false/g)).toHaveLength(10);
    expect(workflow).toContain('pnpm build:apps');
    expect(workflow).toContain('name: production');
    expect(workflow).toContain('fail-fast: false');
    expect(
      workflow.match(
        /needs: \[static-quality, service-contracts, test-suite, browser-tests, production-builds\]/g,
      ),
    ).toHaveLength(3);
    const actionReferences = [...workflow.matchAll(/^\s*-?\s*uses:\s+([^\s#]+)/gm)].map(
      ([, reference]) => reference,
    );
    expect(actionReferences.length).toBeGreaterThan(0);
    expect(actionReferences.every((reference) => /@[a-f0-9]{40}$/.test(reference))).toBe(true);
    expect(workflow).toContain(
      'GOOGLE_ANALYTICS_MEASUREMENT_ID: ${{ secrets.NEXT_PUBLIC_GA_MEASUREMENT_ID }}',
    );
    expect(workflow).toContain(
      'GOOGLE_ANALYTICS_API_SECRET: ${{ secrets.GOOGLE_ANALYTICS_API_SECRET }}',
    );
    expect(workflow).toContain(
      'GOOGLE_ANALYTICS_MEASUREMENT_ID=%s\\nGOOGLE_ANALYTICS_API_SECRET=%s\\n',
    );
    expect(workflow.match(/timeout-minutes:/g)).toHaveLength(10);
    expect(workflow).toContain('run: bash ops/scripts/validate-operations.sh');
  });

  it('keeps immutable GitHub Action pins on a bounded update schedule', () => {
    const dependabot = readFileSync(resolve(workspaceRoot, '.github/dependabot.yml'), 'utf8');

    expect(dependabot).toContain('package-ecosystem: github-actions');
    expect(dependabot).toContain('interval: monthly');
    expect(dependabot).toContain('open-pull-requests-limit: 5');
  });

  it('defines per-target registry caches and grouped Bake builds', () => {
    const bake = readFileSync(resolve(workspaceRoot, 'ops/docker/docker-bake.hcl'), 'utf8');

    expect(bake).toContain('group "api"');
    expect(bake).toContain('group "admin"');
    expect(bake).toContain('group "storefront"');
    expect(bake.match(/cache-from/g)).toHaveLength(6);
    expect(bake.match(/cache-to/g)).toHaveLength(6);
    expect(bake).toContain('mode=max,image-manifest=true,oci-mediatypes=true');
  });

  it('packages the storefront app as the production storefront release surface', () => {
    const dockerfile = readFileSync(
      resolve(workspaceRoot, 'ops/docker/Dockerfile.storefront'),
      'utf8',
    );
    const compose = readFileSync(resolve(workspaceRoot, 'ops/docker/compose.prod.yml'), 'utf8');
    const storefrontPackage = JSON.parse(
      readFileSync(resolve(workspaceRoot, 'apps/storefront/package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };

    expect(dockerfile).toContain('RUN pnpm --filter @bric/storefront build');
    expect(storefrontPackage.scripts.build).toBe('next build --webpack');
    expect(dockerfile).toContain('CMD ["node", "apps/storefront/server.js"]');
    expect(dockerfile).toContain('com.bricomaitre.release-surface="storefront"');
    expect(dockerfile).not.toMatch(/storefront-(?:new|old|v\d+)|storefront\d+/);
    expect(dockerfile).not.toContain('COPY storefront ./storefront');
    expect(compose).toContain('storefront-cache-blue:/app/apps/storefront/.next/cache');
    expect(compose).toContain('storefront-cache-green:/app/apps/storefront/.next/cache');

    const installIndex = dockerfile.indexOf('pnpm install --frozen-lockfile');
    const releaseArgIndex = dockerfile.indexOf('ARG NEXT_PUBLIC_RELEASE');
    const releaseEnvIndex = dockerfile.indexOf('ENV NEXT_PUBLIC_RELEASE=');
    expect(installIndex).toBeGreaterThan(-1);
    expect(releaseArgIndex).toBeGreaterThan(installIndex);
    expect(releaseEnvIndex).toBeGreaterThan(installIndex);
  });

  it('uses compatible filesystem and core-dump hardening with privacy-safe access logs', () => {
    const compose = readFileSync(resolve(workspaceRoot, 'ops/docker/compose.prod.yml'), 'utf8');
    const nginx = readFileSync(resolve(workspaceRoot, 'ops/nginx/nginx.conf'), 'utf8');

    for (const anchor of ['x-storefront-api-blue:', 'x-admin-blue:']) {
      const definition = compose.slice(
        compose.indexOf(anchor),
        compose.indexOf('\n\nx-', compose.indexOf(anchor) + anchor.length),
      );
      expect(definition).toContain('read_only: true');
      expect(definition).toContain('core:');
      expect(definition).toContain('soft: 0');
      expect(definition).toContain('hard: 0');
    }
    const storefrontDefinition = compose.slice(
      compose.indexOf('x-storefront-blue:'),
      compose.indexOf('\n\nservices:', compose.indexOf('x-storefront-blue:')),
    );
    expect(storefrontDefinition).toContain('read_only: false');
    expect(storefrontDefinition).toContain('beneath .next/server');
    expect(storefrontDefinition).toContain('core:');
    const nginxDefinition = compose.slice(compose.indexOf('  nginx:'));
    expect(nginxDefinition).toContain('read_only: true');
    expect(nginxDefinition).toContain('/var/cache/nginx:size=32m,mode=0755');
    expect(nginxDefinition).toContain("test: ['CMD', 'nginx', '-t']");
    expect(nginx).toContain('$request_method $uri $server_protocol');
    expect(nginx).toContain('$request_id $remote_addr');
    expect(nginx).not.toContain('"$request"');
    expect(nginx).not.toContain('$http_referer');

    const nginxTemplate = readFileSync(
      resolve(workspaceRoot, 'ops/nginx/templates/default.conf.template'),
      'utf8',
    );
    expect(nginxTemplate.match(/proxy_set_header X-Request-ID \$request_id;/g)).toHaveLength(5);
    expect(nginxTemplate.match(/add_header X-Request-ID \$request_id always;/g)).toHaveLength(3);
  });

  it('bounds Docker log growth for every long-running production service', () => {
    const compose = readFileSync(resolve(workspaceRoot, 'ops/docker/compose.prod.yml'), 'utf8');

    expect(compose).toContain('x-logging: &default-logging');
    expect(compose).toContain('driver: local');
    expect(compose).toContain('max-size: ${BRIC_LOG_MAX_SIZE:-20m}');
    expect(compose).toContain('max-file: ${BRIC_LOG_MAX_FILES:-5}');
    expect(compose.match(/logging: \*default-logging/g)).toHaveLength(9);
  });

  it('copies the AI workspace dependency required by the admin build', () => {
    const dockerfile = readFileSync(resolve(workspaceRoot, 'ops/docker/Dockerfile.admin'), 'utf8');
    const installIndex = dockerfile.indexOf('pnpm install --frozen-lockfile');
    const aiManifestIndex = dockerfile.indexOf(
      'COPY packages/ai-core/package.json packages/ai-core/package.json',
    );
    const aiSourceIndex = dockerfile.indexOf('COPY packages/ai-core ./packages/ai-core');

    expect(aiManifestIndex).toBeGreaterThan(-1);
    expect(aiManifestIndex).toBeLessThan(installIndex);
    expect(aiSourceIndex).toBeGreaterThan(installIndex);
  });

  it('starts the storefront after pulling both application images', () => {
    const deploy = readFileSync(resolve(workspaceRoot, 'ops/scripts/deploy.sh'), 'utf8');
    const storefrontPull = deploy.indexOf('compose pull "$admin_service" "$storefront_service"');
    const storefrontStart = deploy.indexOf(
      'compose up -d --force-recreate "$admin_service" "$storefront_service"',
    );

    expect(storefrontPull).toBeGreaterThan(-1);
    expect(storefrontStart).toBeGreaterThan(storefrontPull);
  });

  it('releases the inactive app slot after a successful deploy or rollback', () => {
    const deploy = readFileSync(resolve(workspaceRoot, 'ops/scripts/deploy.sh'), 'utf8');
    const rollback = readFileSync(resolve(workspaceRoot, 'ops/scripts/rollback.sh'), 'utf8');
    const blueGreen = readFileSync(resolve(workspaceRoot, 'ops/scripts/blue-green.sh'), 'utf8');

    expect(blueGreen).toContain('stop_slot_app_services()');
    expect(blueGreen).toContain('service_name storefront "$slot"');
    expect(blueGreen).toContain('service_name adminstration "$slot"');
    expect(blueGreen).toContain('service_name storefront-api "$slot"');
    expect(deploy.indexOf('stop_slot_app_services "$previous_slot"')).toBeGreaterThan(
      deploy.indexOf('set_active_slot "$target_slot"'),
    );
    expect(rollback.indexOf('stop_slot_app_services "$current_slot"')).toBeGreaterThan(
      rollback.indexOf('set_active_slot "$target_slot"'),
    );
  });

  it('keeps production env templates secret-free and separates browser from server marketing credentials', () => {
    const storefrontEnv = readFileSync(
      resolve(workspaceRoot, 'ops/env/storefront.env.example'),
      'utf8',
    );
    const apiEnv = readFileSync(
      resolve(workspaceRoot, 'ops/env/storefront-api.env.example'),
      'utf8',
    );
    const compose = readFileSync(resolve(workspaceRoot, 'ops/docker/compose.prod.yml'), 'utf8');
    const apiDefinition = compose.slice(
      compose.indexOf('x-storefront-api-blue:'),
      compose.indexOf('x-storefront-meta-worker:'),
    );
    const metaWorkerDefinition = compose.slice(
      compose.indexOf('x-storefront-meta-worker:'),
      compose.indexOf('x-admin-blue:'),
    );

    expect(storefrontEnv).not.toMatch(/FACEBOOK_ACCESS_TOKEN=.+/);
    expect(storefrontEnv).toContain('NEXT_PUBLIC_TIKTOK_PIXEL_ID=');
    expect(storefrontEnv).not.toMatch(/NEXT_PUBLIC_TIKTOK_PIXEL_ID=.+/);
    expect(apiEnv).toContain('META_CONVERSIONS_API_TOKEN=replace-with-meta-access-token');
    expect(apiEnv).toContain('GOOGLE_ANALYTICS_API_SECRET=replace-me');
    expect(apiEnv).toContain('TIKTOK_PIXEL_ID=');
    expect(apiEnv).not.toMatch(/TIKTOK_PIXEL_ID=.+/);
    expect(apiEnv).toContain('TIKTOK_EVENTS_API_ACCESS_TOKEN=');
    expect(apiEnv).not.toMatch(/TIKTOK_EVENTS_API_ACCESS_TOKEN=.+/);
    expect(apiDefinition).toContain('/storefront-api.env');
    expect(metaWorkerDefinition).toContain('/storefront-api.env');
    expect(apiDefinition).not.toContain('/storefront.env');
    expect(metaWorkerDefinition).not.toContain('/storefront.env');
  });
});
