import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDbMock, runStorefrontDataMaintenanceBatchMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  runStorefrontDataMaintenanceBatchMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ getDb: getDbMock }));
vi.mock('@bric/storefront-core/maintenance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bric/storefront-core/maintenance')>()),
  runStorefrontDataMaintenanceBatch: runStorefrontDataMaintenanceBatchMock,
}));

import {
  ACTION_LOG_RETENTION_DAYS,
  deleteExpiredReportingRunsBatch,
  deleteExpiredReportingSnapshotsBatch,
  getActionLogCutoff,
  getReportingRunCutoff,
  getReportingSnapshotCutoff,
  REPORTING_RUN_RETENTION_DAYS,
  REPORTING_SNAPSHOT_RETENTION_DAYS,
  runDatabaseMaintenance,
} from './database-maintenance';

describe('database maintenance retention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps raw action logs for exactly seven days', () => {
    const now = new Date('2026-07-19T12:30:00.000Z');

    expect(ACTION_LOG_RETENTION_DAYS).toBe(7);
    expect(getActionLogCutoff(now).toISOString()).toBe('2026-07-12T12:30:00.000Z');
  });

  it('keeps reporting payloads for seven days and run metadata for thirty days', () => {
    const now = new Date('2026-07-19T12:30:00.000Z');

    expect(REPORTING_SNAPSHOT_RETENTION_DAYS).toBe(7);
    expect(REPORTING_RUN_RETENTION_DAYS).toBe(30);
    expect(getReportingSnapshotCutoff(now).toISOString()).toBe('2026-07-12T12:30:00.000Z');
    expect(getReportingRunCutoff(now).toISOString()).toBe('2026-06-19T12:30:00.000Z');
  });

  it('reports bounded reporting cleanup counts from the database', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: 3 }] });
    const db = { execute } as never;
    const options = { now: new Date('2026-07-19T12:30:00.000Z'), limit: 25 };

    await expect(deleteExpiredReportingSnapshotsBatch(db, options)).resolves.toBe(2);
    await expect(deleteExpiredReportingRunsBatch(db, options)).resolves.toBe(1);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('drains and reports every full storefront maintenance batch', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    getDbMock.mockReturnValue({ execute });
    const fullBatch = {
      orderIdempotency: 0,
      orderAcquisitionBackfilled: 25,
      orderAiInfluenceBackfilled: 25,
      paidClickNormalizedDays: Array.from({ length: 31 }, (_, index) => `day-${index}`),
      paidClicks: 0,
      paidClickRolledUpDay: null,
      metaRolledUpDay: null,
      metaErrorsCompacted: 0,
      metaOutbox: 0,
      marketingOutbox: 0,
      rolledUpDay: null,
      analyticsErrorsCompacted: 0,
      analyticsEvents: 0,
      analyticsSessions: 25,
      analyticsJourneysCompacted: 0,
      analyticsJourneys: 0,
    };
    runStorefrontDataMaintenanceBatchMock.mockResolvedValueOnce(fullBatch).mockResolvedValueOnce({
      ...fullBatch,
      orderAcquisitionBackfilled: 3,
      orderAiInfluenceBackfilled: 2,
      paidClickNormalizedDays: ['last-day'],
      analyticsSessions: 4,
    });

    await expect(runDatabaseMaintenance({ limit: 25, maxBatches: 3 })).resolves.toMatchObject({
      orderAcquisitionBackfilled: 28,
      orderAiInfluenceBackfilled: 27,
      paidClickNormalizedDays: 32,
      analyticsSessions: 29,
    });
    expect(runStorefrontDataMaintenanceBatchMock).toHaveBeenCalledTimes(2);
    expect(runStorefrontDataMaintenanceBatchMock).toHaveBeenNthCalledWith(
      1,
      { execute },
      { now: expect.any(Date), limit: 25 },
    );
  });
});
