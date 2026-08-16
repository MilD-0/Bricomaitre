import { describe, expect, it, vi } from 'vitest';

import { runDependencyCheck } from './health';

describe('runDependencyCheck', () => {
  it('reports an unconfigured dependency without executing it', async () => {
    const execute = vi.fn();

    await expect(
      runDependencyCheck({ configured: false, label: 'database', execute }),
    ).resolves.toEqual({
      configured: false,
      ok: false,
      latencyMs: null,
      error: 'database is not configured',
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('reports successful and failed checks', async () => {
    await expect(
      runDependencyCheck({
        configured: true,
        label: 'redis',
        execute: async () => 'PONG',
      }),
    ).resolves.toMatchObject({ configured: true, ok: true });

    await expect(
      runDependencyCheck({
        configured: true,
        label: 'redis',
        execute: async () => {
          throw new Error('connection refused');
        },
      }),
    ).resolves.toMatchObject({
      configured: true,
      ok: false,
      error: 'connection refused',
    });
  });

  it('bounds dependency latency', async () => {
    await expect(
      runDependencyCheck({
        configured: true,
        label: 'upstream',
        execute: () => new Promise(() => undefined),
        timeoutMs: 5,
      }),
    ).resolves.toMatchObject({
      configured: true,
      ok: false,
      error: 'upstream timed out after 5ms',
    });
  });
});
