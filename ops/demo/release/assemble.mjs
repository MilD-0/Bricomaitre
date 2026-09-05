import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const version = process.argv[2];
if (!version || !/^[a-z0-9][a-z0-9._-]{0,80}$/.test(version)) {
  throw new Error('Usage: node ops/demo/release/assemble.mjs <version> [output-directory]');
}
const output = resolve(process.argv[3] ?? `${root}/ops/demo/.cache/releases/${version}`);
const namespace = process.env.DEMO_IMAGE_NAMESPACE ?? 'ghcr.io/mild-0/bricomaitre-demo';
if (!/^[a-z0-9./_-]+$/.test(namespace)) throw new Error('Invalid image namespace');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const platforms = (process.env.DEMO_PLATFORMS ?? 'linux/amd64').split(',');
if (platforms.some((platform) => !['linux/amd64', 'linux/arm64'].includes(platform))) {
  throw new Error('Supported build targets are linux/amd64 and linux/arm64');
}
const tagSuffix = process.env.DEMO_TAG_SUFFIX ?? '';
if (!['', '-amd64', '-arm64'].includes(tagSuffix)) throw new Error('Invalid architecture suffix');
const image = (service) => `${namespace}/${service}:${version}${tagSuffix}`;
await mkdir(output, { recursive: true });
execFileSync('node', ['ops/demo/scripts/verify-generated-data.mjs'], {
  cwd: root,
  stdio: 'inherit',
});
const buildRuntime = resolve(output, '.build-runtime');
const buildEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('BRIC_DEMO_')),
);
buildEnvironment.BRIC_DEMO_RUNTIME_DIR = buildRuntime;
execFileSync('bash', ['demo', 'prepare'], {
  cwd: root,
  env: buildEnvironment,
  stdio: 'inherit',
});
const source = JSON.parse(
  execFileSync(
    'docker',
    [
      'compose',
      '--env-file',
      resolve(buildRuntime, 'compose.env'),
      '-f',
      'ops/demo/compose.yml',
      'config',
      '--format',
      'json',
    ],
    { cwd: root, env: buildEnvironment, encoding: 'utf8' },
  ),
);

const builds = { services: {}, secrets: source.secrets };
for (const [name, service] of Object.entries(source.services)) {
  if (!service.build) continue;
  builds.services[name] = { image: image(name), build: service.build };
  if (service.build.args) {
    service.build.args.BRIC_IMAGE_REVISION = revision;
    service.build.args.BRIC_IMAGE_CREATED = new Date().toISOString();
  }
}
builds.services.toolkit = {
  image: image('toolkit'),
  build: {
    context: root,
    dockerfile: 'ops/demo/release/Dockerfile',
    args: { BRIC_IMAGE_REVISION: revision },
  },
};

// A small build context includes only the selected optimized media. Originals,
// upstream dataset downloads, and generated credentials never enter this image.
const mediaRoot = resolve(output, 'media-context');
await mkdir(mediaRoot, { recursive: true });
await cp(resolve(root, 'ops/demo/.cache/images/catalog'), resolve(mediaRoot, 'catalog'), {
  recursive: true,
});
await cp(resolve(root, 'ops/demo/object-storage/assets'), resolve(mediaRoot, 'merchandising'), {
  recursive: true,
});
for (const file of ['init.sh', 'public-read-policy.json']) {
  await cp(resolve(root, 'ops/demo/object-storage', file), resolve(mediaRoot, file));
}
for (const file of ['LICENSE', 'NOTICE']) await cp(resolve(root, file), resolve(mediaRoot, file));
await cp(resolve(root, 'ops/demo/data/sources.lock.json'), resolve(mediaRoot, 'sources.lock.json'));
await cp(
  resolve(root, 'ops/demo/data/image-manifest.tsv'),
  resolve(mediaRoot, 'image-manifest.tsv'),
);
const imageRows = (await readFile(resolve(mediaRoot, 'image-manifest.tsv'), 'utf8'))
  .trim()
  .split('\n');
const checksums = [];
for (const row of imageRows) {
  const [key, position] = row.split('\t');
  const file = `catalog/${key}/${position}.webp`;
  const bytes = await readFile(resolve(mediaRoot, file));
  checksums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${file}`);
}
await writeFile(resolve(mediaRoot, 'SHA256SUMS'), `${checksums.join('\n')}\n`);
await writeFile(
  resolve(mediaRoot, 'Dockerfile'),
  `FROM ${source.services['object-storage-init'].image}
COPY catalog /catalog-images
COPY merchandising /merchandising-assets
COPY init.sh /init.sh
COPY public-read-policy.json /public-read-policy.json
COPY LICENSE NOTICE sources.lock.json image-manifest.tsv SHA256SUMS /licenses/
LABEL org.opencontainers.image.source="https://github.com/MilD-0/Bricomaitre" org.opencontainers.image.revision="${revision}"
ENTRYPOINT ["/bin/sh", "/runtime/run.sh", "media"]
`,
);
builds.services.media = { image: image('media'), build: { context: mediaRoot } };
for (const service of Object.values(builds.services)) service.build.platforms = platforms;
await writeFile(resolve(output, 'compose.build.json'), JSON.stringify(builds, null, 2));

const completed = { condition: 'service_completed_successfully' };
const healthy = { condition: 'service_healthy' };
const runtime = 'runtime:/runtime:ro';
const service = (name, command) => ({
  image: image(name),
  init: true,
  restart: 'unless-stopped',
  cap_drop: ['ALL'],
  security_opt: ['no-new-privileges:true'],
  read_only: true,
  tmpfs: ['/tmp:size=64m,mode=1777'],
  volumes: [runtime],
  entrypoint: ['/bin/sh', '/runtime/run.sh', name],
  command,
  healthcheck: source.services[name].healthcheck,
});
const owner = (command, dependencies) => ({
  image: image('toolkit'),
  restart: 'no',
  volumes: [runtime],
  entrypoint: ['/bin/sh', '/runtime/run.sh', 'owner', ...command],
  depends_on: dependencies,
});
const config = {
  name: 'bricomaitre-demo-release',
  services: {
    initialize: {
      image: image('toolkit'),
      restart: 'no',
      volumes: ['runtime:/runtime'],
      environment: { DEMO_RELEASE: version },
    },
    postgres: {
      image: source.services.postgres.image,
      init: true,
      restart: 'unless-stopped',
      shm_size: '512mb',
      volumes: [runtime, 'postgres-data:/var/lib/postgresql/data'],
      entrypoint: ['/bin/sh', '/runtime/run.sh', 'postgres'],
      healthcheck: source.services.postgres.healthcheck,
      depends_on: { initialize: completed },
    },
    redis: {
      image: source.services.redis.image,
      init: true,
      restart: 'unless-stopped',
      volumes: [runtime, 'redis-data:/data'],
      entrypoint: ['/bin/sh', '/runtime/run.sh', 'redis'],
      healthcheck: {
        test: ['CMD', '/bin/sh', '/runtime/run.sh', 'redis-health'],
        interval: '3s',
        timeout: '3s',
        retries: 30,
      },
      depends_on: { initialize: completed },
    },
    'object-storage': {
      image: source.services['object-storage'].image,
      init: true,
      restart: 'unless-stopped',
      volumes: [runtime, 'object-storage-data:/data'],
      entrypoint: ['/bin/sh', '/runtime/run.sh', 'object-storage'],
      ports: ['127.0.0.1:3900:9000'],
      healthcheck: source.services['object-storage'].healthcheck,
      depends_on: { initialize: completed },
    },
    media: {
      image: image('media'),
      restart: 'no',
      volumes: [runtime],
      depends_on: { 'object-storage': healthy },
    },
    'mock-services': {
      image: image('mock-services'),
      init: true,
      restart: 'unless-stopped',
      healthcheck: source.services['mock-services'].healthcheck,
    },
    migrations: {
      image: image('migrations'),
      restart: 'no',
      volumes: [runtime],
      entrypoint: ['/bin/sh', '/runtime/run.sh', 'migrations'],
      command: ['node', 'apps/admin/dist/run-db-migrations.cjs'],
      depends_on: { postgres: healthy },
    },
    permissions: owner(['/bin/bash', '/bundle/ops/docker/postgres/init-roles.sh'], {
      migrations: completed,
    }),
    dataset: {
      ...owner(['/bin/bash', '/bundle/ops/demo/release/dataset.sh'], { permissions: completed }),
      command: ['initialize'],
    },
    'mock-state': owner(['node', '/bundle/ops/demo/release/mock-state.mjs'], {
      dataset: completed,
      'mock-services': healthy,
    }),
    'storefront-api': {
      ...service('storefront-api', ['node', 'apps/storefront-api/server.js']),
      volumes: [runtime, 'storefront-api-cache:/app/apps/storefront-api/.next/cache'],
      ports: ['127.0.0.1:3401:3001'],
      depends_on: { dataset: completed, media: completed, redis: healthy, 'mock-state': completed },
    },
    admin: {
      ...service('admin', ['node', 'apps/admin/server.js']),
      environment: source.services.admin.environment,
      volumes: [runtime, 'admin-cache:/app/apps/admin/.next/cache'],
      ports: ['127.0.0.1:3400:3000'],
      depends_on: { 'storefront-api': healthy },
    },
    'admin-worker': {
      ...service('admin-worker', ['node', 'apps/admin/dist/run-background-workers.cjs']),
      depends_on: { admin: healthy },
    },
    'storefront-marketing-worker': {
      ...service('storefront-marketing-worker', [
        'node',
        'apps/storefront-api/dist/run-meta-worker.cjs',
      ]),
      depends_on: { 'storefront-api': healthy },
    },
    storefront: {
      ...service('storefront', [
        'node',
        '/app/run-storefront-with-cache-pruning.mjs',
        '/app/apps/storefront/.next/cache',
        'node',
        'apps/storefront/server.js',
      ]),
      read_only: false,
      volumes: [runtime, 'storefront-cache:/app/apps/storefront/.next/cache'],
      ports: ['127.0.0.1:3402:3002'],
      depends_on: { 'storefront-api': healthy },
    },
    'cache-reset': {
      image: source.services.redis.image,
      profiles: ['maintenance'],
      restart: 'no',
      volumes: [
        runtime,
        'admin-cache:/cache/admin',
        'storefront-cache:/cache/storefront',
        'storefront-api-cache:/cache/api',
      ],
      entrypoint: ['/bin/sh', '-ec'],
      command: [
        '. /runtime/compose.env; export REDISCLI_AUTH="$$DEMO_REDIS_PASSWORD"; redis-cli -h redis FLUSHDB; find /cache/admin /cache/storefront /cache/api -mindepth 1 -delete',
      ],
      depends_on: { redis: healthy },
    },
  },
  volumes: Object.fromEntries(
    [
      'runtime',
      'postgres-data',
      'redis-data',
      'object-storage-data',
      'admin-cache',
      'storefront-cache',
      'storefront-api-cache',
    ].map((key) => [key, {}]),
  ),
};
// Never serialize resolved local environment values into a public artifact.
config.services.admin.environment = Object.fromEntries(
  Object.entries(config.services.admin.environment).filter(
    ([key]) => key.startsWith('AI_') || key === 'PORT',
  ),
);
const bundle = resolve(output, 'bricomaitre-demo');
await mkdir(bundle, { recursive: true });
await writeFile(resolve(bundle, 'compose.yaml'), JSON.stringify(config, null, 2));
const yaml = execFileSync(
  'docker',
  [
    'compose',
    '-f',
    resolve(bundle, 'compose.yaml'),
    'config',
    '--no-interpolate',
    '--no-normalize',
  ],
  { encoding: 'utf8' },
);
await writeFile(resolve(bundle, 'compose.yaml'), yaml);
for (const file of ['LICENSE', 'NOTICE']) await cp(resolve(root, file), resolve(bundle, file));
await cp(resolve(root, 'third_party/licenses'), resolve(bundle, 'third_party/licenses'), {
  recursive: true,
});
await cp(resolve(root, 'ops/demo/release/README.md'), resolve(bundle, 'README.md'));
await cp(resolve(root, 'ops/demo/data/sources.lock.json'), resolve(bundle, 'sources.lock.json'));
await cp(resolve(root, 'ops/demo/data/image-manifest.tsv'), resolve(bundle, 'image-manifest.tsv'));
await cp(resolve(mediaRoot, 'SHA256SUMS'), resolve(bundle, 'MEDIA-SHA256SUMS'));
await writeFile(
  resolve(bundle, 'release.json'),
  `${JSON.stringify(
    {
      version,
      revision,
      platforms,
      images: Object.fromEntries(Object.keys(builds.services).map((name) => [name, image(name)])),
      source: `https://github.com/MilD-0/Bricomaitre/tree/${revision}`,
    },
    null,
    2,
  )}\n`,
);
console.log(
  `Release bundle: ${bundle}\nBuild definition: ${resolve(output, 'compose.build.json')}`,
);
