import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { isWorkerHeartbeatFresh, writeWorkerHeartbeat } from './worker-heartbeat';

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
    expect(isWorkerHeartbeatFresh(readFileSync(path, 'utf8'), 20_000)).toBe(true);
  });

  it('rejects stale, future, and malformed heartbeat values', () => {
    expect(isWorkerHeartbeatFresh('1000', 50_001)).toBe(false);
    expect(isWorkerHeartbeatFresh('50001', 50_000)).toBe(false);
    expect(isWorkerHeartbeatFresh('not-a-timestamp', 50_000)).toBe(false);
  });
});
