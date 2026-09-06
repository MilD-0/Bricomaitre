import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';

const source = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../scripts/validate-operations.sh',
);
const fixtures: string[] = [];
afterEach(() => {
  for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true });
});

function validatorFixture() {
  const root = mkdtempSync(join(tmpdir(), 'bric-operations-validator-'));
  fixtures.push(root);
  for (const path of ['bin', 'tmp', 'cache/downloads', 'ops/scripts', 'ops/host', 'ops/env'])
    mkdirSync(join(root, path), { recursive: true });
  copyFileSync(source, join(root, 'ops/scripts/validate-operations.sh'));
  for (const filename of ['admin', 'storefront-api', 'storefront', 'infra'])
    writeFileSync(join(root, `ops/env/${filename}.env.example`), '');
  for (const filename of [
    'bricomaitre-disable-thp.service',
    'bricomaitre-storefront-memory.service',
    'bricomaitre-storefront-memory.timer',
  ])
    writeFileSync(join(root, 'ops/host', filename), '[Unit]\nDescription=Fixture\n');
  const bin = join(root, 'bin');
  // Keep the operating primitives, especially checksum verification, real. The isolated PATH
  // permits only these binaries and the explicitly simulated external tools below.
  for (const command of [
    'bash',
    'dirname',
    'mktemp',
    'rm',
    'mkdir',
    'find',
    'sort',
    'grep',
    'uname',
    'flock',
    'sha256sum',
    'install',
    'mv',
    'cp',
    'tar',
    'sed',
    'seq',
    'tee',
    'cat',
  ]) {
    const location = (process.env.PATH ?? '')
      .split(delimiter)
      .map((path) => join(path, command))
      .find(existsSync);
    if (!location) throw new Error(`Missing fixture prerequisite: ${command}`);
    symlinkSync(location, join(bin, command));
  }
  const tool = (name: string, script: string) => {
    const path = join(bin, name);
    writeFileSync(path, '#!/usr/bin/env bash\nset -eu\n' + script);
    chmodSync(path, 0o755);
  };
  tool(
    'shellcheck',
    `
if [[ "$1" == '--version' ]]; then printf 'version: 0.11.0\\n'; exit 0; fi
printf 'shellcheck\\n' >> "$CALLS_FILE"
exit "$SHELLCHECK_EXIT"
`,
  );
  for (const name of ['node', 'actionlint', 'systemd-analyze']) {
    tool(
      name,
      `printf '${name}\\n' >> "$CALLS_FILE"\nexit "$${name === 'systemd-analyze' ? 'SYSTEMD' : name.toUpperCase()}_EXIT"\n`,
    );
  }
  tool(
    'curl',
    `
printf 'curl\\n' >> "$CALLS_FILE"
while (($#)); do
  if [[ "$1" == '-o' ]]; then shift; destination="$1"; fi
  shift
done
printf 'corrupted downloaded archive' > "$destination"
`,
  );
  tool('sleep', `printf 'sleep:%s\\n' "$1" >> "$CALLS_FILE"`);
  tool(
    'docker',
    `
case "$*" in
  'compose version'|'buildx version') exit 0 ;;
  'compose '*) printf 'compose\\n' >> "$CALLS_FILE"; exit 0 ;;
  'buildx bake '*)
    attempt=0
    if [[ -f "$ATTEMPTS_FILE" ]]; then attempt="$(cat "$ATTEMPTS_FILE")"; fi
    attempt=$((attempt + 1))
    printf '%s' "$attempt" > "$ATTEMPTS_FILE"
    printf 'build:%s\\n' "$attempt" >> "$CALLS_FILE"
    if [[ "$BUILD_MODE" == 'transient-once' && "$attempt" -gt 1 ]]; then exit 0; fi
    case "$BUILD_MODE" in
      transient*) printf 'registry metadata: i/o timeout\\n' >&2; exit 1 ;;
      permanent) printf 'Dockerfile syntax error\\n' >&2; exit 1 ;;
      *) exit 0 ;;
    esac ;;
  *) printf 'Unexpected docker invocation: %s\\n' "$*" >&2; exit 99 ;;
esac
`,
  );
  const callsFile = join(root, 'calls');
  const run = (extraEnv: Record<string, string> = {}) => {
    const result = spawnSync(
      join(bin, 'bash'),
      [join(root, 'ops/scripts/validate-operations.sh')],
      {
        cwd: root,
        env: {
          PATH: bin,
          SHELLCHECK_EXIT: '0',
          NODE_EXIT: '0',
          ACTIONLINT_EXIT: '0',
          SYSTEMD_EXIT: '0',
          BUILD_MODE: 'success',
          TMPDIR: join(root, 'tmp'),
          BRIC_CI_CACHE_DIR: join(root, 'cache'),
          CALLS_FILE: callsFile,
          ATTEMPTS_FILE: join(root, 'attempts'),
          ...extraEnv,
        },
        encoding: 'utf8',
        timeout: 10_000,
      },
    );
    if (result.error) throw result.error;
    const calls = existsSync(callsFile) ? readFileSync(callsFile, 'utf8').trim().split('\n') : [];
    expect(readdirSync(join(root, 'tmp'))).toEqual([]);
    return { status: result.status, output: result.stdout + result.stderr, calls };
  };
  return { root, bin, run };
}

it('rejects corrupt cached and downloaded tool archives using real SHA256 verification', () => {
  const fixture = validatorFixture();
  rmSync(join(fixture.bin, 'shellcheck'));
  const cachedName = `shellcheck-v0.11.0.linux.${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}.tar.xz`;
  const cachePath = join(fixture.root, 'cache/downloads', cachedName);
  writeFileSync(cachePath, 'corrupted cached archive');
  const result = fixture.run();
  expect(result.status).not.toBe(0);
  expect(result.output).toContain('FAILED');
  expect(result.output).not.toContain(
    'Operational scripts, workflow, and Compose configuration are valid.',
  );
  expect(result.calls).toEqual(['curl']);
  expect(readFileSync(cachePath, 'utf8')).toBe('corrupted cached archive');
});

it.each([
  { tool: 'shellcheck', variable: 'SHELLCHECK_EXIT', code: 17, next: 'node' },
  { tool: 'node', variable: 'NODE_EXIT', code: 19, next: 'systemd-analyze' },
  { tool: 'actionlint', variable: 'ACTIONLINT_EXIT', code: 23, next: 'compose' },
])('propagates a failing $tool process and stops validation', ({ tool, variable, code, next }) => {
  const result = validatorFixture().run({ [variable]: String(code) });
  expect(result.status).toBe(code);
  expect(result.calls).toContain(tool);
  expect(result.calls).not.toContain(next);
  expect(result.output).not.toContain(
    'Operational scripts, workflow, and Compose configuration are valid.',
  );
});

it.each([
  { mode: 'success', status: 0, builds: ['build:1'], sleeps: [] },
  { mode: 'transient-once', status: 0, builds: ['build:1', 'build:2'], sleeps: ['sleep:2'] },
  {
    mode: 'transient-always',
    status: 1,
    builds: ['build:1', 'build:2', 'build:3'],
    sleeps: ['sleep:2', 'sleep:4'],
  },
  { mode: 'permanent', status: 1, builds: ['build:1'], sleeps: [] },
])('bounds BuildKit attempts for $mode failures', ({ mode, status, builds, sleeps }) => {
  const result = validatorFixture().run({ BUILD_MODE: mode });
  expect(result.status).toBe(status);
  expect(result.calls.filter((call) => call.startsWith('build:'))).toEqual(builds);
  expect(result.calls.filter((call) => call.startsWith('sleep:'))).toEqual(sleeps);
  expect(
    result.output.includes('Operational scripts, workflow, and Compose configuration are valid.'),
  ).toBe(status === 0);
});
