import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const productionDockerfiles = [
  { path: 'ops/docker/Dockerfile.admin', appDirectory: 'adminstration', stages: 4 },
  { path: 'ops/docker/Dockerfile.storefront-api', appDirectory: 'storefront-api', stages: 3 },
  { path: 'ops/docker/Dockerfile.storefront', appDirectory: 'storefront', stages: 2 },
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
});
