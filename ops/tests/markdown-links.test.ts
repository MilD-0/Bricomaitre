import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const validator = resolve(workspaceRoot, 'ops/scripts/validate-markdown-links.mjs');
const fixtures: string[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

function makeFixture(markdown: string) {
  const root = mkdtempSync(join(tmpdir(), 'bric-markdown-links-'));
  fixtures.push(root);
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'README.md'), markdown);
  writeFileSync(join(root, 'docs', 'architecture.md'), '# Architecture\n');
  return root;
}

function validate(root: string) {
  return spawnSync('node', [validator, '--root', root, 'README.md'], { encoding: 'utf8' });
}

function validateTrackedFiles(root: string) {
  return spawnSync('node', [validator, '--root', root], { encoding: 'utf8' });
}

describe('local Markdown link validation', () => {
  it('accepts files, directories, anchors, external URLs, and examples in code', () => {
    const root = makeFixture(`
[Architecture](./docs/architecture.md#runtime)
[Documentation](./docs/)
[Section](#section)
[External](https://example.com/file)

\`[Illustrative missing link](./not-real.md)\`

~~~md
[Fenced illustrative link](./also-not-real.md)
~~~
`);

    const result = validate(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Validated local links in 1 Markdown files.');
  });

  it('reports missing local targets with the owning document', () => {
    const root = makeFixture('[Missing](./docs/missing.md)\n');

    const result = validate(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('README.md: ./docs/missing.md does not exist');
  });

  it('rejects relative links that escape the repository', () => {
    const root = makeFixture('[Outside](../private.md)\n');

    const result = validate(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('README.md: ../private.md escapes the workspace');
  });

  it('ignores tracked Markdown files deleted in the current worktree', () => {
    const root = makeFixture('[Architecture](./docs/architecture.md)\n');
    const deletedDocument = join(root, 'docs', 'deleted.md');
    writeFileSync(deletedDocument, '# Deleted soon\n');
    spawnSync('git', ['init', '--quiet'], { cwd: root });
    spawnSync('git', ['add', 'README.md', 'docs'], { cwd: root });
    rmSync(deletedDocument);

    const result = validateTrackedFiles(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Validated local links in 2 Markdown files.');
  });
});
