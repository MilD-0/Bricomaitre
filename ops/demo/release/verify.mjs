import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const bundle = resolve(process.argv[2]);
const project = process.env.DEMO_TEST_PROJECT ?? 'bricomaitre-demo-release-test';
if (!/^bricomaitre-demo-[a-z0-9-]+test$/.test(project))
  throw new Error('Use a dedicated test project');
const args = ['compose', '-p', project, '-f', resolve(bundle, 'compose.yaml')];
const compose = (...command) =>
  execFileSync('docker', [...args, ...command], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
async function run(...command) {
  const child = spawn('docker', [...args, ...command], { stdio: 'inherit' });
  const timer = setInterval(
    () => console.log(`Still verifying: docker compose ${command.join(' ')}`),
    30_000,
  );
  const deadline = setTimeout(() => child.kill('SIGTERM'), 20 * 60_000);
  try {
    await new Promise((done, reject) => {
      child.once('error', reject);
      child.once('exit', (code) =>
        code === 0 ? done() : reject(new Error(`Compose exited ${code}`)),
      );
    });
  } finally {
    clearInterval(timer);
    clearTimeout(deadline);
  }
}
const sql = (query) =>
  compose(
    'exec',
    '-T',
    'postgres',
    '/bin/sh',
    '/runtime/run.sh',
    'owner',
    'psql',
    '-X',
    '-U',
    'bricomaitre_demo_owner',
    '-d',
    'bricomaitre_demo',
    '-Atc',
    query,
  ).trim();
const config = JSON.parse(compose('config', '--format', 'json'));
for (const definition of Object.values(config.services)) {
  assert.ok(
    !definition.build && !definition.env_file,
    'Install must not need source or host env files',
  );
  assert.ok(
    definition.volumes?.every((volume) => volume.type === 'volume') ?? true,
    'No host bind mounts',
  );
  assert.ok(Number(definition.cpus) > 0 && Number(definition.mem_limit) > 0);
  assert.equal(definition.memswap_limit, definition.mem_limit);
  assert.ok(definition.pids_limit > 0);
  assert.equal(definition.logging.options['max-file'], '3');
  assert.deepEqual(definition.dns, ['127.0.0.1']);
  assert.ok(definition.ports?.every((port) => port.host_ip === '127.0.0.1') ?? true);
}
for (const name of [
  'admin',
  'admin-worker',
  'storefront-api',
  'storefront-marketing-worker',
  'storefront',
]) {
  assert.equal(config.services[name].read_only, true);
  assert.ok(config.services[name].volumes.every((volume) => volume.source !== 'runtime'));
}
const release = JSON.parse(await readFile(resolve(bundle, 'release.json'), 'utf8'));
// Custom images were built locally; infrastructure images still need to be
// pulled into the engine on a clean runner, not merely into BuildKit's cache.
await run('pull', 'postgres', 'redis', 'object-storage');
await run('up', '-d', '--wait', '--wait-timeout', '1200', '--pull', 'never');
for (const port of [3400, 3401, 3402]) {
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(response.status, 200);
}
for (const name of ['admin', 'storefront-api', 'storefront']) {
  compose(
    'exec',
    '-T',
    name,
    '/bin/sh',
    '-ec',
    'test -r /runtime/app.env && test ! -e /runtime/secrets.env && test ! -e /runtime/compose.env',
  );
}
assert.equal(sql('SELECT count(*) FROM products'), '3884');
assert.equal(sql('SELECT count(*) FROM orders'), '250800');
assert.equal(sql('SELECT build_key FROM demo_runtime.template_metadata'), release.version);
const image = sql('SELECT images[1] FROM products ORDER BY id LIMIT 1');
const response = await fetch(image);
assert.equal(response.status, 200);
assert.match(response.headers.get('content-type'), /image/);

// Restart the one-shot services too: startup must preserve edits and credentials.
const before = sql('SELECT reset_at FROM demo_runtime.live_metadata');
const credentialHash = compose('exec', '-T', 'postgres', 'sha256sum', '/runtime/secrets.env');
sql('UPDATE products SET inventory_quantity = inventory_quantity + 1 WHERE id = 1');
const stock = sql('SELECT inventory_quantity FROM products WHERE id = 1');
await run('down');
await run('up', '-d', '--wait', '--wait-timeout', '1200', '--pull', 'never');
assert.equal(sql('SELECT reset_at FROM demo_runtime.live_metadata'), before);
assert.equal(sql('SELECT inventory_quantity FROM products WHERE id = 1'), stock);
assert.equal(
  compose('exec', '-T', 'postgres', 'sha256sum', '/runtime/secrets.env'),
  credentialHash,
);

const apps = [
  'storefront',
  'admin',
  'admin-worker',
  'storefront-api',
  'storefront-marketing-worker',
];
await run('stop', ...apps);
await run('run', '--rm', '--no-deps', 'dataset', 'reset');
assert.notEqual(sql('SELECT inventory_quantity FROM products WHERE id = 1'), stock);
// Simulate a later-day reset without changing the host or container clock.
sql("UPDATE demo_runtime.template_metadata SET built_at = built_at - interval '1 day'");
await run('run', '--rm', '--no-deps', 'dataset', 'reset');
assert.equal(sql('SELECT built_at::date = CURRENT_DATE FROM demo_runtime.template_metadata'), 't');
await run('run', '--rm', '--no-deps', 'media', 'reset');
await run('run', '--rm', '--no-deps', 'cache-reset');
await run('run', '--rm', '--no-deps', 'storefront-runtime', 'reset');
await run('restart', 'mock-services');
await run('up', '-d', '--wait', '--wait-timeout', '60', '--no-deps', 'mock-services');
await run('run', '--rm', '--no-deps', 'mock-state');
await run('start', ...apps);
assert.notEqual(sql('SELECT reset_at FROM demo_runtime.live_metadata'), before);
assert.notEqual(sql('SELECT inventory_quantity FROM products WHERE id = 1'), stock);
assert.equal(sql('SELECT count(*) FROM orders'), '250800');
assert.equal(
  compose('exec', '-T', 'postgres', 'sha256sum', '/runtime/secrets.env'),
  credentialHash,
);
await run('up', '-d', '--wait', '--wait-timeout', '180', '--pull', 'never');
console.log('Fresh installation, restart preservation, local media, and reset all passed.');
console.log(`Test project retained for inspection: ${project}`);
