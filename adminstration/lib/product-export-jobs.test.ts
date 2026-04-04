import { describe, expect, it, vi } from 'vitest';

import { ProductExportJobManager } from './product-export-jobs';

describe('ProductExportJobManager', () => {
  it('returns the same running job for the same owner and blocks other owners', async () => {
    const manager = new ProductExportJobManager({
      throttleMs: 10_000,
      createId: () => 'job-1',
    });

    let releaseJob!: () => void;
    const runner = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        releaseJob = resolve;
      });

      return {
        buffer: Buffer.from('file'),
        fileName: 'products-export.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    });

    const firstStart = manager.startJob('owner-a', runner);
    expect(firstStart.kind).toBe('started');

    const sameOwner = manager.startJob('owner-a', runner);
    expect(sameOwner.kind).toBe('existing');
    if (sameOwner.kind !== 'existing' || firstStart.kind !== 'started') {
      throw new Error('Unexpected start result');
    }
    expect(sameOwner.job.id).toBe(firstStart.job.id);

    const otherOwner = manager.startJob('owner-b', runner);
    expect(otherOwner.kind).toBe('busy');

    releaseJob();
    await Promise.resolve();
    await Promise.resolve();

    const completed = manager.getVisibleJob('owner-a');
    expect(completed?.status).toBe('completed');
    expect(completed?.downloadPath).toContain('job-1');
  });

  it('supports cancellation and enforces throttle windows between runs', async () => {
    let now = 100;
    const manager = new ProductExportJobManager({
      throttleMs: 1_000,
      now: () => now,
      createId: () => `job-${now}`,
    });

    const started = manager.startJob('owner-a', async (job) => {
      job.setProgress({ phase: 'loading', current: 1, total: 3 });
      await job.sleep(0);
      job.throwIfCancelled();
      return {
        buffer: Buffer.from('file'),
        fileName: 'products-export.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    });

    expect(started.kind).toBe('started');
    expect(manager.cancelJob('owner-a')?.id).toBe('job-100');
    await Promise.resolve();
    await Promise.resolve();
    expect(manager.getVisibleJob('owner-a')?.status).toBe('cancelled');

    now = 600;
    const throttled = manager.startJob('owner-a', async () => ({
      buffer: Buffer.from('file'),
      fileName: 'products-export.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }));

    expect(throttled.kind).toBe('throttled');

    now = 1_600;
    const restarted = manager.startJob('owner-a', async () => ({
      buffer: Buffer.from('file'),
      fileName: 'products-export.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }));

    expect(restarted.kind).toBe('started');
  });
});
