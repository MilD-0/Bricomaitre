import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';

const worker = vi.hoisted(() => ({
  waitUntilReady: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
}));
const meta = vi.hoisted(() => ({
  processMetaOutboxBatch: vi.fn(),
  updateMetaWorkerHeartbeat: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@sentry/node', () => ({ init: vi.fn(), captureException: vi.fn(), close: vi.fn() }));
vi.mock('@bric/runtime/jobs', () => ({ createLightweightQueueWorker: () => worker }));
vi.mock('@bric/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@bric/storefront-core/analytics', () => ({ ingestStorefrontAnalyticsEvent: vi.fn() }));
vi.mock('@bric/storefront-core/meta', () => ({
  ...meta,
  clearExpiredMetaAttribution: vi.fn(),
  reconcileOrderConfirmedEvents: vi.fn(),
  reconcileOrderCompletedEvents: vi.fn(),
}));
vi.mock('@bric/storefront-core/marketing', () => ({
  clearExpiredMarketingAttribution: vi.fn(),
  reconcileMarketingOrderEvents: vi.fn(),
  processMarketingOutboxBatch: vi.fn().mockResolvedValue({ claimed: 0 }),
}));

const lifecycle: EventEmitter = process;
const signals = ['SIGINT', 'SIGTERM', 'uncaughtException', 'unhandledRejection'] as const;
const originalListeners = new Map(signals.map((signal) => [signal, lifecycle.listeners(signal)]));
let directory: string;
afterEach(async () => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const signal of signals) {
    for (const listener of lifecycle.listeners(signal)) {
      if (!originalListeners.get(signal)?.includes(listener))
        lifecycle.removeListener(signal, listener as (...args: unknown[]) => void);
    }
  }
  await rm(directory, { recursive: true, force: true });
});

test('keeps file liveness current during a stalled drain without reporting completed work', async () => {
  directory = await mkdtemp(join(tmpdir(), 'bric-worker-liveness-'));
  const heartbeat = join(directory, 'heartbeat');
  vi.stubEnv('BRIC_WORKER_HEARTBEAT_PATH', heartbeat);
  vi.useFakeTimers({
    toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
  });
  vi.setSystemTime(new Date('2026-09-01T00:00:00Z'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  let finishDrain!: (value: { claimed: number }) => void;
  meta.processMetaOutboxBatch.mockReturnValue(
    new Promise((resolve) => {
      finishDrain = resolve;
    }),
  );
  await import('./run-meta-worker');
  await vi.waitFor(() => expect(meta.processMetaOutboxBatch).toHaveBeenCalledOnce());
  const startedAt = Number(await readFile(heartbeat, 'utf8'));

  await vi.advanceTimersByTimeAsync(60_000);
  await vi.waitFor(async () => {
    const recordedAt = Number(await readFile(heartbeat, 'utf8'));
    expect(recordedAt).toBeGreaterThanOrEqual(startedAt + 60_000);
    expect(Date.now() - recordedAt).toBeLessThan(15_000);
  });
  expect(Date.now() - startedAt).toBeGreaterThan(45_000);
  expect(meta.updateMetaWorkerHeartbeat).not.toHaveBeenCalled();

  const shutdown = process
    .listeners('SIGTERM')
    .find((listener) => !originalListeners.get('SIGTERM')?.includes(listener));
  await (shutdown as (signal: string) => Promise<void>)('SIGTERM');
  const stoppedAt = await readFile(heartbeat, 'utf8');
  await vi.advanceTimersByTimeAsync(30_000);
  expect(await readFile(heartbeat, 'utf8')).toBe(stoppedAt);
  expect(worker.close).toHaveBeenCalledOnce();
  finishDrain({ claimed: 0 });
  await vi.advanceTimersByTimeAsync(1_000);
});
