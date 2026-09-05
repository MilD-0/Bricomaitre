#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import {
  root,
  runtime,
  identity,
  loadManifest,
  registryPath,
  withLock,
  run,
  assertNoLocalEnv,
} from './state.mjs';
import {
  up,
  stop,
  checks,
  services,
  compose,
  composeOutput,
  query,
  supervisorAlive,
} from './environment.mjs';

const usage = `Usage:
  ./bric doctor                         Check local prerequisites
  ./bric worktree create <name>          Create a sibling task worktree from HEAD
  ./bric env up                         Migrate, seed and start this worktree's isolated stack
  ./bric env status                     Health, worker liveness and source identity (JSON)
  ./bric env stop                       Stop this worktree's processes and dependencies
  ./bric env reset                      Delete this task's data and restart with small fixtures
  ./bric env destroy                    Delete this task's containers, volumes and port reservation
  ./bric logs <service> [lines]          Read bounded service logs
  ./bric db <sql>                       Run a read-only query against the task database
  ./bric inspect order <id>              Order, history and line items
  ./bric inspect job <queue> <id>       Redis job status, progress and failure details
  ./bric inspect providers               Recorded mock-provider requests
  ./bric verify [--plan] [--base <ref>]   Run focused checks and save evidence
  ./bric verify -- <command> [args...]    Record a specific check (15 minute limit)
  ./bric qa                             Real checkout → retry → confirmation → worker → carrier

Linux, Node, pnpm and Docker Compose are required. Runtime and evidence: ops/runtime/dev.
`;
async function destroy() {
  const m = loadManifest();
  await stop(m);
  if (existsSync(join(runtime, 'dependencies.json')))
    await compose(m, ['down', '--volumes', '--remove-orphans', '--timeout', '10']);
  const reservation = join(registryPath(), `${m.ports.admin}.json`);
  if (existsSync(reservation)) {
    const owner = JSON.parse(readFileSync(reservation, 'utf8'));
    if (owner.root !== root || owner.project !== m.project)
      throw new Error('Port reservation ownership mismatch.');
    rmSync(reservation);
  }
  for (const file of [
    'environment.json',
    'processes.json',
    'process-env.json',
    'dependencies.json',
  ])
    rmSync(join(runtime, file), { force: true });
  console.log(`Destroyed ${m.project}. Logs and verification evidence retained.`);
}
async function main() {
  const [command, action, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === 'help') {
    console.log(usage);
    return;
  }
  if (command === 'doctor') {
    const results = [];
    for (const [name, command, args] of [
      ['git', 'git', ['--version']],
      ['pnpm', 'pnpm', ['--version']],
      ['docker', 'docker', ['info', '--format', '{{.ServerVersion}}']],
      ['compose', 'docker', ['compose', 'version']],
    ]) {
      try {
        results.push({
          name,
          ok: true,
          version: execFileSync(command, args, {
            encoding: 'utf8',
            timeout: 15000,
            stdio: ['ignore', 'pipe', 'pipe'],
          }).trim(),
        });
      } catch (error) {
        results.push({ name, ok: false, error: error.message });
      }
    }
    results.push({
      name: 'node',
      ok: Number(process.versions.node.split('.')[0]) >= 24,
      version: process.version,
    });
    results.push({ name: 'linux-process-ownership', ok: process.platform === 'linux' });
    results.push({ name: 'dependencies', ok: existsSync(join(root, 'node_modules/.pnpm')) });
    try {
      assertNoLocalEnv();
      results.push({ name: 'local-env-isolation', ok: true });
    } catch (error) {
      results.push({ name: 'local-env-isolation', ok: false, error: error.message });
    }
    try {
      const { chromium } = await import('@playwright/test');
      const path = chromium.executablePath();
      results.push({ name: 'chromium', ok: existsSync(path), path });
    } catch (error) {
      results.push({ name: 'chromium', ok: false, error: error.message });
    }
    console.log(JSON.stringify({ root, checks: results }, null, 2));
    if (results.some((r) => !r.ok)) process.exitCode = 1;
    return;
  }
  if (command === 'worktree' && action === 'create') {
    const [name] = args;
    if (!name || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(name))
      throw new Error('Use a lowercase task name, up to 48 letters, numbers or hyphens.');
    if (identity().dirty)
      throw new Error(
        'Commit the intended source first; new worktrees start at HEAD and cannot include uncommitted edits.',
      );
    const target = join(dirname(root), `${basename(root)}-${name}`);
    await run('git', ['worktree', 'add', '-b', `task/${name}`, target, 'HEAD']);
    console.log(
      `Created ${target}\nNext: cd ${target}, pnpm install --frozen-lockfile, ./bric doctor, ./bric env up`,
    );
    return;
  }
  if (command === 'env') {
    if (action === 'status') {
      const m = loadManifest();
      const current = identity();
      const health = await checks(m);
      const sameSource = current.fingerprint === m.source.fingerprint;
      const alive = supervisorAlive(m);
      console.log(
        JSON.stringify(
          {
            environment: m,
            currentSource: current,
            sourceMatches: sameSource,
            supervisorAlive: alive,
            checks: health,
          },
          null,
          2,
        ),
      );
      if (!sameSource || !alive || health.some((c) => !c.ok)) process.exitCode = 1;
      return;
    }
    return withLock(async () => {
      if (action === 'up') return up();
      if (action === 'stop') return stop();
      if (action === 'destroy') return destroy();
      if (action === 'reset') {
        await destroy();
        return up();
      }
      throw new Error(usage);
    });
  }
  if (command === 'logs') {
    if (![...services, 'supervisor'].includes(action))
      throw new Error(`Choose ${[...services, 'supervisor'].join(', ')}.`);
    const lines = Number(args[0] ?? 100);
    if (!Number.isInteger(lines) || lines < 1 || lines > 2000)
      throw new Error('Choose 1–2000 lines.');
    await run('tail', ['-n', String(lines), join(runtime, `${action}.log`)]);
    return;
  }
  if (command === 'db') {
    if (!action) throw new Error('Provide a SQL query.');
    console.log(query(loadManifest(), [action, ...args].join(' ')));
    return;
  }
  if (command === 'inspect') {
    const m = loadManifest();
    if (action === 'job') {
      const [queue, id] = args;
      if (![queue, id].every((v) => typeof v === 'string' && /^[a-zA-Z0-9:_-]{1,128}$/.test(v)))
        throw new Error('Provide a queue name and job ID.');
      const value = composeOutput(m, [
        'exec',
        '-T',
        'redis',
        'redis-cli',
        '--raw',
        'GET',
        `bric:jobs:${queue}:${id}`,
      ]).trim();
      if (!value) throw new Error('Job snapshot not found (it may have expired).');
      console.log(JSON.stringify(JSON.parse(value), null, 2));
      return;
    }
    if (action === 'providers') {
      const response = await fetch(`${m.urls.mocks}/__demo/requests`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Provider journal HTTP ${response.status}`);
      console.log(await response.text());
      return;
    }
    if (action === 'order') {
      const id = Number(args[0]);
      if (!Number.isSafeInteger(id) || id < 1) throw new Error('Provide a positive order ID.');
      console.log(
        query(
          m,
          `SELECT jsonb_pretty(to_jsonb(o)) FROM orders o WHERE id=${id}; SELECT jsonb_pretty(to_jsonb(h)) FROM order_status_history h WHERE order_id=${id}; SELECT jsonb_pretty(to_jsonb(i)) FROM order_line_items i WHERE order_id=${id}`,
        ),
      );
      return;
    }
  }
  if (command === 'verify') {
    const { verify } = await import('./verify.mjs');
    return withLock(() => verify(process.argv.slice(3)));
  }
  if (command === 'qa') {
    const { verify } = await import('./verify.mjs');
    return withLock(() => verify(['--qa']));
  }
  throw new Error(usage);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
