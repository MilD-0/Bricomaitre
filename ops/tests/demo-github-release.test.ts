import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';

const script = resolve(import.meta.dirname, '../demo/release/github-release.mjs');
const revision = 'a'.repeat(40);
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture(state: Record<string, unknown> = {}) {
  const root = mkdtempSync(resolve(tmpdir(), 'bric-demo-release-'));
  directories.push(root);
  const bin = resolve(root, 'bin');
  const bundle = resolve(root, 'bricomaitre-demo');
  mkdirSync(bin);
  mkdirSync(bundle);
  writeFileSync(resolve(bundle, 'release.json'), JSON.stringify({ version: 'test.1', revision }));
  writeFileSync(resolve(root, 'state.json'), JSON.stringify(state));
  writeFileSync(resolve(root, 'calls.json'), '[]');
  writeFileSync(
    resolve(bin, 'gh'),
    `#!/usr/bin/env node
const fs = require('node:fs');
const root = process.env.FIXTURE_ROOT;
const args = process.argv.slice(2);
const calls = JSON.parse(fs.readFileSync(root + '/calls.json'));
calls.push(args);
fs.writeFileSync(root + '/calls.json', JSON.stringify(calls));
const state = JSON.parse(fs.readFileSync(root + '/state.json'));
function reply(value) { console.log(JSON.stringify(value)); }
if (args[0] === 'release' && args[1] === 'view') {
  if (state.lookupError) { console.error('HTTP 403: Resource not accessible by integration'); process.exit(1); }
  if (!state.release) { console.error('release not found'); process.exit(1); }
  reply({ isDraft: state.release === 'draft' });
} else if (args[0] === 'api' && args[1].includes('/git/matching-refs/')) {
  reply(state.tag ? [{ ref: 'refs/tags/demo-test.1', object: { type: state.annotated ? 'tag' : 'commit', sha: state.tag } }] : []);
} else if (args[0] === 'api' && args[1].includes('/git/tags/')) {
  reply({ object: { type: 'commit', sha: state.target } });
} else if (args[0] === 'api' && args[1].endsWith('/git/refs')) {
  state.tag = args.find(arg => arg.startsWith('sha=')).slice(4);
  fs.writeFileSync(root + '/state.json', JSON.stringify(state));
  reply({});
} else if (args[0] === 'release' && ['create', 'upload'].includes(args[1])) {
  reply({});
} else { throw new Error('Unexpected gh call: ' + JSON.stringify(args)); }
`,
    { mode: 0o755 },
  );
  return {
    run(operation: 'prepare' | 'publish') {
      const result = spawnSync(
        process.execPath,
        [
          script,
          operation,
          operation === 'prepare' ? 'test.1' : bundle,
          operation === 'prepare' ? revision : 'docs/demo.md',
        ],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${bin}${delimiter}${process.env.PATH}`,
            GITHUB_REPOSITORY: 'owner/repository',
            FIXTURE_ROOT: root,
          },
        },
      );
      return {
        ...result,
        calls: JSON.parse(readFileSync(resolve(root, 'calls.json'), 'utf8')) as string[][],
      };
    },
  };
}

it('reserves and verifies the exact source before native builds', () => {
  const result = fixture().run('prepare');
  expect(result.status).toBe(0);
  expect(result.calls).toContainEqual([
    'api',
    'repos/owner/repository/git/refs',
    '--method',
    'POST',
    '-f',
    'ref=refs/tags/demo-test.1',
    '-f',
    `sha=${revision}`,
  ]);
  expect(result.calls.filter((call) => call[1]?.includes('matching-refs'))).toHaveLength(2);
});

it('accepts an annotated tag at the intended revision without moving it', () => {
  const result = fixture({ tag: 'b'.repeat(40), annotated: true, target: revision }).run('prepare');
  expect(result.status).toBe(0);
  expect(result.calls.flat()).not.toContain('POST');
});

it('creates a draft from the verified tag without submitting a historical target', () => {
  const result = fixture({ tag: revision }).run('publish');
  expect(result.status).toBe(0);
  const create = result.calls.find((call) => call[1] === 'create')!;
  expect(create).toContain('--verify-tag');
  expect(create).toContain('--draft');
  expect(create).not.toContain('--target');
  expect(create.some((arg) => arg.endsWith('.tar.gz.sha256'))).toBe(true);
});

it('retries artifact uploads to an existing draft', () => {
  const result = fixture({ tag: revision, release: 'draft' }).run('publish');
  expect(result.status).toBe(0);
  expect(result.calls.find((call) => call[1] === 'upload')).toContain('--clobber');
  expect(result.calls.some((call) => call[1] === 'create')).toBe(false);
});

it.each(['prepare', 'publish'] as const)('rejects a different revision during %s', (operation) => {
  const result = fixture({ tag: 'b'.repeat(40) }).run(operation);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('different source revision');
  expect(
    result.calls.some((call) => call.includes('POST') || ['create', 'upload'].includes(call[1]!)),
  ).toBe(false);
});

it.each(['prepare', 'publish'] as const)('protects published versions during %s', (operation) => {
  const result = fixture({ tag: revision, release: 'published' }).run(operation);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('cannot be overwritten');
  expect(result.calls).toHaveLength(1);
});

it('does not mistake denied release access for a missing draft', () => {
  const result = fixture({ lookupError: true }).run('prepare');
  expect(result.status).not.toBe(0);
  expect(result.calls).toHaveLength(1);
});

it('refuses publication without a reserved tag', () => {
  const result = fixture().run('publish');
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Reserve the demo tag');
  expect(result.calls.some((call) => call[1] === 'create')).toBe(false);
});
