import { createHash, randomBytes } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  openSync,
  closeSync,
  rmSync,
  realpathSync,
} from 'node:fs';
import { join, sep } from 'node:path';
import {
  root,
  runtime,
  initialize,
  loadManifest,
  saveJson,
  identity,
  run,
  cleanEnvironment,
  assertNoLocalEnv,
  ownsProcess,
  roles,
  available,
} from './state.mjs';

function dataFingerprint() {
  const hash = createHash('sha256');
  for (const path of [
    'ops/dev/seed.sql',
    'ops/demo/postgres/seed/10-reference.sql',
    'ops/demo/data/algeria-wilayas.csv',
    'ops/demo/data/algeria-communes.csv',
  ])
    hash.update(readFileSync(join(root, path)));
  return hash.digest('hex');
}

export function clearTaskDataCaches(cwd = root) {
  const ownedRoot = realpathSync(cwd);
  const paths = ['admin', 'storefront-api', 'storefront']
    .flatMap((app) =>
      ['.next/cache/fetch-cache', '.next/dev/cache/fetch-cache'].map((cache) =>
        join(ownedRoot, 'apps', app, cache),
      ),
    )
    .filter(existsSync);
  for (const path of paths) {
    if (!realpathSync(path).startsWith(`${ownedRoot}${sep}`))
      throw new Error(`Task data cache points outside this worktree: ${path}`);
  }
  for (const path of paths) rmSync(path, { recursive: true });
}
export const services = ['api', 'admin', 'storefront', 'admin-worker', 'meta-worker'];
function readEnv(path) {
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i), l.slice(i + 1)];
      }),
  );
}
function demoEnvironment(m) {
  const p = m.ports;
  return {
    ...cleanEnvironment(),
    BRIC_DEMO_RUNTIME_DIR: join(runtime, 'demo'),
    BRIC_DEMO_ADMIN_PORT: String(p.admin),
    BRIC_DEMO_API_PORT: String(p.api),
    BRIC_DEMO_STOREFRONT_PORT: String(p.storefront),
    BRIC_DEMO_OBJECT_PORT: String(p.objects),
    BRIC_DEMO_OBJECT_CONSOLE_PORT: String(p.objectConsole),
    BRIC_DEMO_MOCK_PORT: String(p.mocks),
  };
}
function composeArgs(m, args) {
  return [
    'compose',
    '--project-name',
    m.project,
    '-f',
    join(runtime, 'dependencies.json'),
    ...args,
  ];
}
export async function compose(m, args) {
  return run('docker', composeArgs(m, args));
}
export function composeOutput(m, args) {
  return execFileSync('docker', composeArgs(m, args), {
    cwd: root,
    env: cleanEnvironment(),
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 4 * 1024 * 1024,
  });
}
export function query(m, sql) {
  return composeOutput(m, [
    'exec',
    '-T',
    'postgres',
    'psql',
    '-X',
    '-U',
    'bric_dev_reader',
    '-d',
    'bricomaitre_demo',
    '-v',
    'ON_ERROR_STOP=1',
    '-Atc',
    `BEGIN READ ONLY; SET LOCAL statement_timeout='5s'; ${sql}; COMMIT;`,
  ]);
}
async function configure(m) {
  if (existsSync(join(runtime, 'demo/host.env')))
    throw new Error('Remove task demo/host.env overrides; the task manifest owns its endpoints.');
  await run('bash', ['demo', 'prepare'], { env: demoEnvironment(m) });
  const compiled = JSON.parse(
    execFileSync(
      'docker',
      [
        'compose',
        '--env-file',
        join(runtime, 'demo/compose.env'),
        '-f',
        join(root, 'ops/demo/compose.yml'),
        'config',
        '--format',
        'json',
      ],
      { cwd: root, env: demoEnvironment(m), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
    ),
  );
  const names = [
    'postgres',
    'redis',
    'object-storage',
    'object-storage-init',
    'mock-services',
    'database-permissions',
    'seed',
  ];
  const subset = Object.fromEntries(names.map((name) => [name, compiled.services[name]]));
  // Private exports request SSE-S3. Keep the task's local key across restarts.
  // https://github.com/minio/minio/blob/master/docs/kms/IAM.md
  const keyFile = join(runtime, 'object-storage-key');
  if (!existsSync(keyFile))
    writeFileSync(keyFile, randomBytes(32).toString('base64'), { mode: 0o600, flag: 'wx' });
  subset['object-storage'].environment.MINIO_KMS_SECRET_KEY =
    `task-key:${readFileSync(keyFile, 'utf8').trim()}`;
  const ports = { postgres: 5432, redis: 6379, 'object-storage': 9000, 'mock-services': 8080 };
  for (const [name, service] of Object.entries(subset)) {
    service.restart = 'no';
    delete service.depends_on;
    delete service.networks;
    service.labels = { ...service.labels, 'com.bricomaitre.environment': m.id };
    if (ports[name])
      service.ports = [
        {
          host_ip: '127.0.0.1',
          published: String(
            m.ports[{ 'object-storage': 'objects', 'mock-services': 'mocks' }[name] ?? name],
          ),
          target: ports[name],
        },
      ];
  }
  subset.postgres.volumes = subset.postgres.volumes.filter(
    (v) => !v.target.startsWith('/docker-entrypoint-initdb.d/'),
  );
  subset['object-storage'].ports.push({
    host_ip: '127.0.0.1',
    published: String(m.ports.objectConsole),
    target: 9001,
  });
  mkdirSync(join(runtime, 'catalog-images'), { recursive: true });
  subset['object-storage-init'].volumes = subset['object-storage-init'].volumes.map((v) =>
    v.target === '/catalog-images' ? { ...v, source: join(runtime, 'catalog-images') } : v,
  );
  subset.seed.volumes.push({
    type: 'bind',
    source: join(root, 'ops/dev'),
    target: '/dev-seed',
    read_only: true,
  });
  subset.seed.entrypoint = [
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-v',
    `seed_fingerprint=${dataFingerprint()}`,
    '-h',
    'postgres',
    '-U',
    'bricomaitre_demo_owner',
    '-d',
    'bricomaitre_demo',
    '-f',
    '/dev-seed/seed.sql',
  ];
  saveJson(join(runtime, 'dependencies.json'), {
    name: m.project,
    services: subset,
    volumes: Object.fromEntries(
      ['postgres-data', 'redis-data', 'object-storage-data'].map((n) => [
        n,
        { labels: { 'com.bricomaitre.environment': m.id } },
      ]),
    ),
  });
  const generated = readEnv(join(runtime, 'demo/compose.env'));
  const maps = {};
  for (const app of ['admin', 'storefront-api', 'storefront']) {
    const env = readEnv(join(runtime, `demo/${app}.env`));
    for (const [key, value] of Object.entries(env))
      env[key] = value
        .replaceAll('http://mock-services:8080', m.urls.mocks)
        .replaceAll('http://object-storage:9000', m.urls.objects)
        .replaceAll('http://storefront-api:3001', m.urls.api)
        .replaceAll('http://storefront:3002', m.urls.storefront)
        .replaceAll('redis:6379', `127.0.0.1:${m.ports.redis}`);
    if (env.GOOGLE_SEARCH_CONSOLE_CREDENTIALS_BASE64) {
      const credentials = JSON.parse(
        Buffer.from(env.GOOGLE_SEARCH_CONSOLE_CREDENTIALS_BASE64, 'base64').toString('utf8'),
      );
      credentials.token_uri = `${m.urls.mocks}/google/oauth2/token`;
      env.GOOGLE_SEARCH_CONSOLE_CREDENTIALS_BASE64 = Buffer.from(
        JSON.stringify(credentials),
      ).toString('base64');
    }
    Object.assign(env, {
      NODE_ENV: 'development',
      SENTRY_RELEASE: `dev-${m.source.fingerprint.slice(0, 16)}`,
      NEXT_PUBLIC_RELEASE: `dev-${m.source.fingerprint.slice(0, 16)}`,
      NEXT_TELEMETRY_DISABLED: '1',
      CIRCLE_NODE_TOTAL: '2',
      NODE_OPTIONS: '--max-old-space-size=2048',
      BRIC_DEMO_MODE: 'true',
      AI_ENABLED: 'false',
      SENTRY_AUTH_TOKEN: '',
      SENTRY_DSN_ADMIN: '',
      SENTRY_DSN_WORKER: '',
      SENTRY_DSN_STOREFRONT_API: '',
      NEXT_PUBLIC_SENTRY_DSN_ADMIN: '',
      SENTRY_DSN_STOREFRONT: '',
      NEXT_PUBLIC_SENTRY_DSN_STOREFRONT: '',
    });
    const role = app === 'admin' ? 'ADMIN' : 'STOREFRONT';
    env.DATABASE_URL = `postgresql://bricomaitre_demo_${role.toLowerCase()}:${generated[`DEMO_POSTGRES_${role}_PASSWORD`]}@127.0.0.1:${m.ports.postgres}/bricomaitre_demo`;
    maps[app] = env;
  }
  maps.owner = {
    ...maps.admin,
    DATABASE_URL: `postgresql://bricomaitre_demo_owner:${generated.DEMO_POSTGRES_OWNER_PASSWORD}@127.0.0.1:${m.ports.postgres}/bricomaitre_demo`,
  };
  saveJson(join(runtime, 'process-env.json'), maps);
}
export function processEnvironment(app) {
  return {
    ...cleanEnvironment(),
    ...JSON.parse(readFileSync(join(runtime, 'process-env.json'), 'utf8'))[app],
  };
}
async function prepareData(m) {
  await run('pnpm', ['--filter', '@bric/admin', 'db:migrate'], {
    env: processEnvironment('owner'),
  });
  await run('pnpm', ['--filter', '@bric/admin', 'db:verify'], { env: processEnvironment('owner') });
  await compose(m, ['run', '--rm', '--no-deps', 'database-permissions']);
  const seeded = composeOutput(m, [
    'exec',
    '-T',
    'postgres',
    'psql',
    '-X',
    '-U',
    'bricomaitre_demo_owner',
    '-d',
    'bricomaitre_demo',
    '-Atc',
    "SELECT to_regclass('demo_runtime.dev_seed') IS NOT NULL",
  ])
    .split('\n')
    .includes('t');
  if (!seeded) await compose(m, ['run', '--rm', '--no-deps', 'seed']);
  composeOutput(m, [
    'exec',
    '-T',
    'postgres',
    'psql',
    '-X',
    '-U',
    'bricomaitre_demo_owner',
    '-d',
    'bricomaitre_demo',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `DO $body$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='bric_dev_reader') THEN CREATE ROLE bric_dev_reader LOGIN; END IF; END $body$; GRANT CONNECT ON DATABASE bricomaitre_demo TO bric_dev_reader; GRANT USAGE ON SCHEMA public, admin, demo_runtime TO bric_dev_reader; GRANT SELECT ON ALL TABLES IN SCHEMA public, admin, demo_runtime TO bric_dev_reader;`,
  ]);
  const fingerprint = query(m, 'SELECT fingerprint FROM demo_runtime.dev_seed WHERE version=1')
    .trim()
    .split('\n');
  if (!fingerprint.includes(dataFingerprint()))
    throw new Error(
      'Fixture source changed. Run ./bric env reset to rebuild this task’s disposable data.',
    );
  m.dataFingerprint = dataFingerprint();
}
export function supervisorAlive(m) {
  return ownsProcess(m.supervisorPid, 'supervisor.mjs');
}
export async function stop(m = loadManifest()) {
  if (supervisorAlive(m)) {
    process.kill(m.supervisorPid, 'SIGTERM');
    const end = Date.now() + 20000;
    while (supervisorAlive(m) && Date.now() < end) await new Promise((r) => setTimeout(r, 200));
    if (supervisorAlive(m))
      throw new Error('Supervisor did not stop; inspect supervisor.log before retrying.');
  }
  if (existsSync(join(runtime, 'dependencies.json'))) await compose(m, ['stop', '--timeout', '10']);
  m.state = 'stopped';
  delete m.supervisorPid;
  saveJson(join(runtime, 'environment.json'), m);
}
export async function up() {
  assertNoLocalEnv();
  const m = await initialize();
  if (supervisorAlive(m))
    throw new Error('Environment already runs. Use env stop before restarting source and workers.');
  for (const role of roles.filter((r) => ['admin', 'api', 'storefront'].includes(r)))
    if (!(await available(m.ports[role])))
      throw new Error(`${role} port ${m.ports[role]} is occupied.`);
  m.source = identity();
  m.state = 'starting';
  saveJson(join(runtime, 'environment.json'), m);
  try {
    await configure(m);
    await compose(m, [
      'up',
      '-d',
      '--build',
      '--wait',
      '--wait-timeout',
      '90',
      'postgres',
      'redis',
      'object-storage',
      'mock-services',
    ]);
    await prepareData(m);
    await compose(m, ['run', '--rm', '--no-deps', 'object-storage-init']);
    for (const name of ['admin-worker', 'meta-worker'])
      rmSync(join(runtime, `${name}.heartbeat`), { force: true });
    const log = openSync(join(runtime, 'supervisor.log'), 'a', 0o600);
    const child = spawn(process.execPath, [join(root, 'ops/dev/supervisor.mjs')], {
      cwd: root,
      env: cleanEnvironment(),
      detached: true,
      stdio: ['ignore', log, log],
    });
    child.unref();
    closeSync(log);
    m.supervisorPid = child.pid;
    saveJson(join(runtime, 'environment.json'), m);
    await waitReady(m);
    if (identity().fingerprint !== m.source.fingerprint)
      throw new Error(
        'Source changed during startup; restart the environment before verification.',
      );
    m.state = 'running';
    saveJson(join(runtime, 'environment.json'), m);
    console.log(JSON.stringify({ urls: m.urls, source: m.source, artifacts: runtime }, null, 2));
  } catch (error) {
    await stop(m).catch((e) => console.error(e.message));
    throw error;
  }
}
export async function checks(m) {
  const results = await Promise.all(
    ['api', 'admin', 'storefront'].map(async (name) => {
      const start = Date.now();
      try {
        const r = await fetch(`${m.urls[name]}/api/health`, { signal: AbortSignal.timeout(8000) });
        const body = await r.json();
        const expected = `dev-${m.source.fingerprint.slice(0, 16)}`;
        return {
          name,
          ok: r.ok && body.release === expected,
          status: r.status,
          release: body.release,
          expectedRelease: expected,
          latencyMs: Date.now() - start,
        };
      } catch (e) {
        return { name, ok: false, error: e.message };
      }
    }),
  );
  for (const name of ['admin-worker', 'meta-worker']) {
    let recorded = 0;
    try {
      recorded = Number(readFileSync(join(runtime, `${name}.heartbeat`), 'utf8'));
    } catch {}
    const ageMs = Date.now() - recorded;
    results.push({
      name,
      ok: ageMs >= 0 && ageMs < 45000,
      heartbeatAgeMs: recorded ? ageMs : null,
    });
  }
  return results;
}
async function waitReady(m) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (!supervisorAlive(m))
      throw new Error(
        'Environment process exited; inspect ops/runtime/dev/supervisor.log and service logs.',
      );
    const state = await checks(m);
    console.log(state.map((s) => `${s.name}=${s.ok ? 'ready' : 'waiting'}`).join(' '));
    if (state.every((s) => s.ok)) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Workflow readiness timed out. Logs are preserved in ops/runtime/dev.');
}
