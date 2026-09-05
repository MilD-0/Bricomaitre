import { spawn } from 'node:child_process';
import { openSync, closeSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, runtime, loadManifest } from './state.mjs';
import { processEnvironment } from './environment.mjs';

const m = loadManifest();
const commands = [
  [
    'api',
    'storefront-api',
    ['exec', 'next', 'dev', '--hostname', '127.0.0.1', '--port', String(m.ports.api)],
  ],
  [
    'admin',
    'admin',
    ['exec', 'next', 'dev', '--hostname', '127.0.0.1', '--port', String(m.ports.admin)],
  ],
  [
    'storefront',
    'storefront',
    ['exec', 'next', 'dev', '--hostname', '127.0.0.1', '--port', String(m.ports.storefront)],
  ],
  ['admin-worker', 'admin', ['worker']],
  ['meta-worker', 'storefront-api', ['worker:meta']],
];
let stopping = false;
const children = [];
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {}
  }
  const hard = setTimeout(() => {
    for (const child of children) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {}
    }
    process.exit(code);
  }, 10000);
  Promise.all(
    children.map((c) =>
      c.exitCode !== null || c.signalCode
        ? Promise.resolve()
        : new Promise((r) => c.once('exit', r)),
    ),
  ).then(() => {
    for (const child of children) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {}
    }
    clearTimeout(hard);
    process.exit(code);
  });
}
for (const [name, app, args] of commands) {
  const fd = openSync(join(runtime, `${name}.log`), 'a', 0o600);
  const child = spawn('pnpm', ['--filter', `@bric/${app}`, ...args], {
    cwd: root,
    env: {
      ...processEnvironment(app),
      BRIC_WORKER_HEARTBEAT_PATH: join(runtime, `${name}.heartbeat`),
    },
    detached: true,
    stdio: ['ignore', fd, fd],
  });
  closeSync(fd);
  children.push(child);
  child.once('error', (error) => {
    console.error(name, error.message);
    shutdown(1);
  });
  child.once('exit', (code, signal) => {
    if (!stopping) {
      console.error(`${name} exited ${code ?? signal}`);
      shutdown(code || 1);
    }
  });
}
writeFileSync(
  join(runtime, 'processes.json'),
  JSON.stringify(
    children.map((c, i) => ({ name: commands[i][0], pid: c.pid })),
    null,
    2,
  ),
  { mode: 0o600 },
);
process.on('SIGTERM', () => shutdown());
process.on('SIGINT', () => shutdown());
