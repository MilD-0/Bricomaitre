import { execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, runtime, identity, saveJson, run, assertNoLocalEnv } from './state.mjs';

export function changedFiles(base = 'HEAD', cwd = root) {
  const diff = execFileSync('git', ['diff', '--name-only', '-z', base, '--'], {
    cwd,
    encoding: 'utf8',
  });
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
    cwd,
    encoding: 'utf8',
  });
  return [...new Set((diff + untracked).split('\0').filter(Boolean))].sort();
}
export function planFor(files) {
  const commands = [];
  const code = files.filter((f) => !/\.(md|txt)$/.test(f) && !f.startsWith('docs/'));
  const add = (...args) => commands.push(['pnpm', ...args]);
  const formatted = files.filter(
    (f) => /\.(m?[jt]sx?|json|md|ya?ml|css)$/.test(f) && existsSync(join(root, f)),
  );
  if (formatted.length) add('exec', 'prettier', '--check', ...formatted);
  if (!code.length) return commands;
  const shared = code.some((f) => f.startsWith('packages/'));
  const global = code.some(
    (f) =>
      !f.startsWith('apps/') && !f.startsWith('ops/') && !f.startsWith('packages/') && f !== 'bric',
  );
  if (shared || global) {
    add('test:packages');
    add('typecheck');
    add('dead-code:check');
  }
  if (global || code.some((f) => f.startsWith('ops/') || f === 'bric')) {
    add('exec', 'eslint', 'ops', '--max-warnings=0');
    add('--filter', '@bric/ops', 'typecheck');
    add('test:ops');
  }
  for (const app of ['storefront-api', 'storefront', 'admin']) {
    if (!(shared || global || code.some((f) => f.startsWith(`apps/${app}/`)))) continue;
    for (const script of shared || global ? ['lint', 'test'] : ['lint', 'typecheck', 'test'])
      add('--filter', `@bric/${app}`, script);
    if (app === 'storefront' || app === 'admin')
      add('--filter', `@bric/${app}`, 'test:integration');
  }
  return commands;
}
export async function verify(args) {
  assertNoLocalEnv();
  const custom = args[0] === '--';
  let base = 'HEAD';
  const baseIndex = custom ? -1 : args.indexOf('--base');
  if (baseIndex >= 0) {
    if (!args[baseIndex + 1] || args[baseIndex + 1].startsWith('-'))
      throw new Error('--base requires a Git revision.');
    base = execFileSync('git', ['rev-parse', '--verify', `${args[baseIndex + 1]}^{commit}`], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
  }
  const qa = args[0] === '--qa';
  if (
    !custom &&
    args.some(
      (a, i) =>
        !['--qa', '--plan', '--base'].includes(a) && !(baseIndex >= 0 && i === baseIndex + 1),
    )
  )
    throw new Error('Unknown verify option. Use --plan, --base <ref>, or -- <command> [args].');
  if (custom && args.length < 2) throw new Error('Provide a command after --.');
  const files = changedFiles(base);
  const commands = qa
    ? [[process.execPath, join(root, 'ops/dev/qa.mjs')]]
    : custom
      ? [args.slice(1)]
      : planFor(files);
  if (args.includes('--plan') && !custom) {
    console.log(
      JSON.stringify(
        {
          scope: 'focused',
          base,
          files,
          commands,
          excluded:
            'Browser suites, service contracts, performance and production builds require explicit commands; this is not a release gate.',
        },
        null,
        2,
      ),
    );
    return;
  }
  if (!commands.length)
    throw new Error(
      'No checks selected. Use --base <commit> to include committed work, or -- <command> to record a specific check.',
    );
  const dir = join(
    runtime,
    'evidence',
    new Date().toISOString().replaceAll(':', '-') + `-${process.pid}`,
  );
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const report = {
    version: 1,
    scope: qa ? 'connected-qa' : custom ? 'custom' : 'focused',
    startedAt: new Date().toISOString(),
    sourceBefore: identity(),
    base,
    files,
    plannedCommands: commands,
    checks: [],
    status: 'running',
  };
  saveJson(join(dir, 'report.json'), report);
  let failure;
  for (const [command, ...argv] of commands) {
    const result = {
      command: [command, ...argv],
      startedAt: new Date().toISOString(),
      status: 'running',
    };
    report.checks.push(result);
    const log = createWriteStream(join(dir, `${report.checks.length}.log`), { mode: 0o600 });
    try {
      if (qa) {
        const { cleanEnvironment } = await import('./state.mjs');
        await run(command, argv, {
          log,
          timeout: 900000,
          env: { ...cleanEnvironment(), BRIC_QA_ARTIFACTS: dir },
        });
      } else await run(command, argv, { log, timeout: 900000 });
      result.status = 'passed';
    } catch (error) {
      result.status = 'failed';
      result.error = error.message;
      failure = error;
    } finally {
      await new Promise((resolve) => log.end(resolve));
      result.finishedAt = new Date().toISOString();
      saveJson(join(dir, 'report.json'), report);
    }
    if (failure) break;
  }
  report.sourceAfter = identity();
  report.sourceMatches = report.sourceBefore.fingerprint === report.sourceAfter.fingerprint;
  report.status = failure ? 'failed' : report.sourceMatches ? 'passed' : 'invalidated';
  report.finishedAt = new Date().toISOString();
  if (failure || qa) {
    for (const name of [
      'supervisor',
      'api',
      'admin',
      'storefront',
      'admin-worker',
      'meta-worker',
    ]) {
      const path = join(runtime, `${name}.log`);
      if (existsSync(path))
        writeFileSync(
          join(dir, `${name}.log`),
          readFileSync(path, 'utf8').split('\n').slice(-500).join('\n'),
          { mode: 0o600 },
        );
    }
  }
  saveJson(join(dir, 'report.json'), report);
  console.log(`Verification ${report.status}: ${join(dir, 'report.json')}`);
  if (failure) throw failure;
  if (!report.sourceMatches)
    throw new Error('Source changed during verification; evidence is invalidated.');
}
