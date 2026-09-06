import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { writeWorkerHeartbeat } from './worker-heartbeat';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('worker heartbeat', () => {
  it('writes a private timestamp that a container healthcheck can inspect', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'bric-worker-heartbeat-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'ready');

    await writeWorkerHeartbeat(path, 1_000);

    expect(readFileSync(path, 'utf8')).toBe('1000\n');
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });
});
