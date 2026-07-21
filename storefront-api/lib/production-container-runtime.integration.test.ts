import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const productionDockerfiles = [
  { path: 'ops/docker/Dockerfile.admin', appDirectory: 'adminstration', stages: 4 },
  { path: 'ops/docker/Dockerfile.storefront-api', appDirectory: 'storefront-api', stages: 3 },
  { path: 'ops/docker/Dockerfile.storefront', appDirectory: 'storefront-new', stages: 2 },
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
    expect(imagePipeline.match(/node-version: 24/g)).toHaveLength(4);
    expect(workflow).toContain('    needs: assemble-release-manifest');
    expect(workflow).toContain('pnpm --filter storefront-new exec playwright install --with-deps chromium');
    expect(workflow).toContain('run_step "Storefront browser acceptance tests" pnpm test:storefront:browser');
    expect(workflow).toContain('GOOGLE_ANALYTICS_MEASUREMENT_ID: ${{ secrets.NEXT_PUBLIC_GA_MEASUREMENT_ID }}');
    expect(workflow).toContain('GOOGLE_ANALYTICS_API_SECRET: ${{ secrets.GOOGLE_ANALYTICS_API_SECRET }}');
    expect(workflow).toContain('GOOGLE_ANALYTICS_MEASUREMENT_ID=%s\\nGOOGLE_ANALYTICS_API_SECRET=%s\\n');
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

  it('packages storefront-new as the production storefront release surface', () => {
    const dockerfile = readFileSync(resolve(workspaceRoot, 'ops/docker/Dockerfile.storefront'), 'utf8');
    const compose = readFileSync(resolve(workspaceRoot, 'ops/docker/compose.prod.yml'), 'utf8');

    expect(dockerfile).toContain('RUN pnpm --filter storefront-new build');
    expect(dockerfile).toContain('CMD ["node", "storefront-new/server.js"]');
    expect(dockerfile).not.toContain('COPY storefront ./storefront');
    expect(compose).toContain('storefront-cache-blue:/app/storefront-new/.next/cache');
    expect(compose).toContain('storefront-cache-green:/app/storefront-new/.next/cache');

    const installIndex = dockerfile.indexOf('pnpm install --frozen-lockfile');
    const releaseArgIndex = dockerfile.indexOf('ARG NEXT_PUBLIC_RELEASE');
    const releaseEnvIndex = dockerfile.indexOf('ENV NEXT_PUBLIC_RELEASE=');
    expect(installIndex).toBeGreaterThan(-1);
    expect(releaseArgIndex).toBeGreaterThan(installIndex);
    expect(releaseEnvIndex).toBeGreaterThan(installIndex);
  });

  it('copies the AI workspace dependency required by the admin build', () => {
    const dockerfile = readFileSync(resolve(workspaceRoot, 'ops/docker/Dockerfile.admin'), 'utf8');
    const installIndex = dockerfile.indexOf('pnpm install --frozen-lockfile');
    const aiManifestIndex = dockerfile.indexOf('COPY packages/ai-core/package.json packages/ai-core/package.json');
    const aiSourceIndex = dockerfile.indexOf('COPY packages/ai-core ./packages/ai-core');

    expect(aiManifestIndex).toBeGreaterThan(-1);
    expect(aiManifestIndex).toBeLessThan(installIndex);
    expect(aiSourceIndex).toBeGreaterThan(installIndex);
  });

  it('discards only the inactive legacy storefront cache during the first storefront-new cutover', () => {
    const deploy = readFileSync(resolve(workspaceRoot, 'ops/scripts/deploy.sh'), 'utf8');
    const resetDefinition = deploy.indexOf('reset_legacy_storefront_cache()');
    const storefrontPull = deploy.indexOf('compose pull "$admin_service" "$storefront_service"');
    const resetCall = deploy.indexOf('reset_legacy_storefront_cache "$target_slot" "$storefront_service"');
    const storefrontStart = deploy.indexOf('compose up -d --force-recreate "$admin_service" "$storefront_service"');

    expect(resetDefinition).toBeGreaterThan(-1);
    expect(deploy).toContain("grep -qx 'BRIC_STOREFRONT_APP=storefront-new'");
    expect(deploy).toContain('*_storefront-cache-"$slot"');
    expect(deploy).toContain('docker volume rm "$volume_name"');
    expect(resetCall).toBeGreaterThan(storefrontPull);
    expect(storefrontStart).toBeGreaterThan(resetCall);
  });

  it('keeps production env templates secret-free and separates browser from server marketing credentials', () => {
    const storefrontEnv = readFileSync(resolve(workspaceRoot, 'ops/env/storefront.env.example'), 'utf8');
    const apiEnv = readFileSync(resolve(workspaceRoot, 'ops/env/storefront-api.env.example'), 'utf8');
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
    expect(storefrontEnv).toContain('NEXT_PUBLIC_TIKTOK_PIXEL_ID=replace-me');
    expect(apiEnv).toContain('META_CONVERSIONS_API_TOKEN=replace-with-meta-access-token');
    expect(apiEnv).toContain('GOOGLE_ANALYTICS_API_SECRET=replace-me');
    expect(apiEnv).toContain('TIKTOK_EVENTS_API_ACCESS_TOKEN=replace-me');
    expect(apiDefinition).toContain('/storefront-api.env');
    expect(metaWorkerDefinition).toContain('/storefront-api.env');
    expect(apiDefinition).not.toContain('/storefront.env');
    expect(metaWorkerDefinition).not.toContain('/storefront.env');
  });
});
