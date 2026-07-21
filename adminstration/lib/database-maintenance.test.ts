import { describe, expect, it } from 'vitest';

import { ACTION_LOG_RETENTION_DAYS, getActionLogCutoff } from './database-maintenance';

describe('database maintenance retention', () => {
  it('keeps raw action logs for exactly seven days', () => {
    const now = new Date('2026-07-19T12:30:00.000Z');

    expect(ACTION_LOG_RETENTION_DAYS).toBe(7);
    expect(getActionLogCutoff(now).toISOString()).toBe('2026-07-12T12:30:00.000Z');
  });
});
