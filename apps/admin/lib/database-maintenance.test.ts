import { describe, expect, it, vi } from 'vitest';

import {
  ACTION_LOG_RETENTION_DAYS,
  deleteExpiredReportingRunsBatch,
  deleteExpiredReportingSnapshotsBatch,
  getActionLogCutoff,
  getReportingRunCutoff,
  getReportingSnapshotCutoff,
  REPORTING_RUN_RETENTION_DAYS,
  REPORTING_SNAPSHOT_RETENTION_DAYS,
} from './database-maintenance';

describe('database maintenance retention', () => {
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
});
