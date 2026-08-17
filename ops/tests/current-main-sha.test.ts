import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const workspaceRoot = resolve(import.meta.dirname, '../..');
const script = resolve(workspaceRoot, 'ops/scripts/current-main-sha.sh');
const temporaryDirectories: string[] = [];

function run(command: string, args: string[], cwd: string) {
  return spawnSync(command, args, { cwd, encoding: 'utf8' });
}

describe('current production branch resolution', () => {
  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('returns the latest main SHA without changing the checked-out commit', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bric-current-main-'));
    temporaryDirectories.push(directory);
    const remote = join(directory, 'remote');
    const checkout = join(directory, 'checkout');

    expect(run('git', ['init', '--initial-branch=main', remote], directory).status).toBe(0);
    expect(
      run('git', ['-C', remote, 'config', 'user.name', 'Bricomaitre CI'], directory).status,
    ).toBe(0);
    expect(
      run('git', ['-C', remote, 'config', 'user.email', 'ci@bricomaitre.invalid'], directory)
        .status,
    ).toBe(0);
    writeFileSync(join(remote, 'release.txt'), 'first\n');
    expect(run('git', ['-C', remote, 'add', 'release.txt'], directory).status).toBe(0);
    expect(run('git', ['-C', remote, 'commit', '-m', 'First release'], directory).status).toBe(0);

    expect(run('git', ['init', checkout], directory).status).toBe(0);
    expect(
      run('git', ['-C', checkout, 'config', 'user.name', 'Bricomaitre CI'], directory).status,
    ).toBe(0);
    expect(
      run('git', ['-C', checkout, 'config', 'user.email', 'ci@bricomaitre.invalid'], directory)
        .status,
    ).toBe(0);
    writeFileSync(join(checkout, 'checked-out.txt'), 'verified release\n');
    expect(run('git', ['-C', checkout, 'add', 'checked-out.txt'], directory).status).toBe(0);
    expect(run('git', ['-C', checkout, 'commit', '-m', 'Verified release'], directory).status).toBe(
      0,
    );
    expect(run('git', ['-C', checkout, 'remote', 'add', 'origin', remote], directory).status).toBe(
      0,
    );
    const checkedOutSha = run(
      'git',
      ['-C', checkout, 'rev-parse', 'HEAD'],
      directory,
    ).stdout.trim();

    const firstResolution = run('bash', [script], checkout);
    const firstSha = run('git', ['-C', remote, 'rev-parse', 'HEAD'], directory).stdout.trim();
    expect(firstResolution).toMatchObject({ status: 0, stderr: '' });
    expect(firstResolution.stdout.trim()).toBe(firstSha);

    writeFileSync(join(remote, 'release.txt'), 'second\n');
    expect(run('git', ['-C', remote, 'commit', '-am', 'Second release'], directory).status).toBe(0);

    const secondResolution = run('bash', [script], checkout);
    const secondSha = run('git', ['-C', remote, 'rev-parse', 'HEAD'], directory).stdout.trim();
    expect(secondResolution).toMatchObject({ status: 0, stderr: '' });
    expect(secondResolution.stdout.trim()).toBe(secondSha);
    expect(secondSha).not.toBe(firstSha);
    expect(run('git', ['-C', checkout, 'rev-parse', 'HEAD'], directory).stdout.trim()).toBe(
      checkedOutSha,
    );
  });
});
