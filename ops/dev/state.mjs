import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  realpathSync,
  lstatSync,
  readdirSync,
  unlinkSync,
  renameSync,
  readlinkSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';

export const root = realpathSync(resolve(import.meta.dirname, '../..'));
export const runtime = join(root, 'ops/runtime/dev');
export const roles = [
  'admin',
  'api',
  'storefront',
  'postgres',
  'redis',
  'objects',
  'objectConsole',
  'mocks',
];
export const projectFor = (path) =>
  `bric-dev-${createHash('sha256').update(realpathSync(path)).digest('hex').slice(0, 12)}`;
const git = (args, cwd = root) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
export function saveJson(path, value) {
  mkdirSync(resolve(path, '..'), { recursive: true, mode: 0o700 });
  writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  // Single writer under the environment lock; rename prevents partial reads.
  renameSync(`${path}.tmp`, path);
}
export function identity(cwd = root) {
  const paths = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd, encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean);
  const hash = createHash('sha256');
  for (const path of [...new Set(paths)].sort()) {
    hash.update(path + '\0');
    const full = join(cwd, path);
    if (!existsSync(full)) {
      hash.update('deleted\0');
      continue;
    }
    const stat = lstatSync(full);
    hash.update(String(stat.mode) + '\0');
    hash.update(stat.isSymbolicLink() ? readlinkSync(full) : readFileSync(full));
    hash.update('\0');
  }
  return {
    commit: git(['rev-parse', 'HEAD'], cwd),
    branch: git(['branch', '--show-current'], cwd),
    fingerprint: hash.digest('hex'),
    dirty: Boolean(git(['status', '--porcelain'], cwd)),
  };
}
export function loadManifest() {
  const manifest = JSON.parse(readFileSync(join(runtime, 'environment.json'), 'utf8'));
  if (manifest.version !== 1 || manifest.root !== root || manifest.project !== projectFor(root))
    throw new Error(
      'Environment ownership mismatch. Do not reuse another worktree’s runtime directory.',
    );
  if (
    roles.some(
      (role) =>
        !Number.isInteger(manifest.ports[role]) ||
        manifest.ports[role] < 1024 ||
        manifest.ports[role] > 65535,
    ) ||
    new Set(Object.values(manifest.ports)).size !== roles.length
  )
    throw new Error('Invalid environment ports.');
  manifest.urls = Object.fromEntries(
    ['admin', 'api', 'storefront', 'objects', 'mocks'].map((role) => [
      role,
      `http://127.0.0.1:${manifest.ports[role]}`,
    ]),
  );
  return manifest;
}
export async function available(port) {
  const server = createServer();
  return new Promise((resolve) => {
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}
export async function allocatePorts(registry) {
  for (let base = 14000; base < 24000; base += roles.length) {
    if (existsSync(join(registry, `${base}.json`))) continue;
    if ((await Promise.all(roles.map((_, i) => available(base + i)))).every(Boolean)) {
      try {
        writeFileSync(
          join(registry, `${base}.json`),
          JSON.stringify({ root, project: projectFor(root) }),
          { flag: 'wx', mode: 0o600 },
        );
      } catch (error) {
        if (error.code === 'EEXIST') continue;
        throw error;
      }
      return Object.fromEntries(roles.map((role, i) => [role, base + i]));
    }
  }
  throw new Error('No free task port block; inspect the environment registry.');
}
export function registryPath() {
  return join(resolve(root, git(['rev-parse', '--git-common-dir'])), 'bric-environments');
}
export async function initialize() {
  if (existsSync(join(runtime, 'environment.json'))) return loadManifest();
  mkdirSync(runtime, { recursive: true, mode: 0o700 });
  const registry = registryPath();
  mkdirSync(registry, { recursive: true, mode: 0o700 });
  const ports = await allocatePorts(registry);
  const manifest = {
    version: 1,
    id: randomUUID(),
    root,
    project: projectFor(root),
    profile: 'small',
    createdAt: new Date().toISOString(),
    ports,
    urls: Object.fromEntries(
      ['admin', 'api', 'storefront', 'objects', 'mocks'].map((role) => [
        role,
        `http://127.0.0.1:${ports[role]}`,
      ]),
    ),
    source: identity(),
    state: 'stopped',
  };
  saveJson(join(runtime, 'environment.json'), manifest);
  return manifest;
}
export function cleanEnvironment() {
  return Object.fromEntries(
    [
      'PATH',
      'HOME',
      'USER',
      'LOGNAME',
      'LANG',
      'LC_ALL',
      'TMPDIR',
      'XDG_CACHE_HOME',
      'COREPACK_HOME',
      'PNPM_HOME',
    ]
      .filter((k) => process.env[k])
      .map((k) => [k, process.env[k]]),
  );
}
export function assertNoLocalEnv() {
  for (const path of ['', 'apps/admin', 'apps/storefront-api', 'apps/storefront']) {
    const files = readdirSync(join(root, path)).filter(
      (f) => /^\.env(?:\.|$)/.test(f) && !f.endsWith('.example'),
    );
    if (files.length)
      throw new Error(
        `${path || 'Repository root'} contains local environment files (${files.join(', ')}). Use a fresh worktree so task configuration cannot inherit live services.`,
      );
  }
}
export async function run(
  command,
  args,
  { cwd = root, env = cleanEnvironment(), log, timeout = 600_000 } = {},
) {
  console.log(`> ${command} ${args.join(' ')}`);
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: log ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    detached: true,
  });
  child.once('exit', () => {
    // A successful wrapper must not leave descendants holding the log pipes open.
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {}
  });
  if (log) {
    child.stdout.on('data', (d) => {
      log.write(d);
      process.stdout.write(d);
    });
    child.stderr.on('data', (d) => {
      log.write(d);
      process.stderr.write(d);
    });
  }
  let stopped = false;
  const stop = () => {
    stopped = true;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {}
  };
  const timer = setTimeout(stop, timeout);
  const hardStop = setTimeout(() => {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {}
  }, timeout + 5000);
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  try {
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) =>
        code === 0 && !stopped
          ? resolve()
          : reject(
              new Error(
                `${command} ${stopped ? 'was interrupted or exceeded its time limit' : `exited ${code ?? signal}`}`,
              ),
            ),
      );
    });
  } finally {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {}
    clearTimeout(timer);
    clearTimeout(hardStop);
    process.off('SIGTERM', stop);
    process.off('SIGINT', stop);
  }
}
export async function withLock(action) {
  mkdirSync(runtime, { recursive: true, mode: 0o700 });
  const path = join(runtime, 'operation.lock');
  try {
    writeFileSync(path, String(process.pid), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new Error(
      `Another environment operation owns ${path}. Check its PID before removing a stale lock.`,
    );
  }
  try {
    return await action();
  } finally {
    unlinkSync(path);
  }
}
export function ownsProcess(pid, script) {
  if (!Number.isInteger(pid) || pid < 2) return false;
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8')
      .split('\0')
      .includes(join(root, 'ops/dev', script));
  } catch {
    return false;
  }
}
