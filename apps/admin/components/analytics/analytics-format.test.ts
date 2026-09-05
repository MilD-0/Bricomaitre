import { describe, expect, it } from 'vitest';

import {
  formatCurrency,
  formatDate,
  formatDzd,
  formatDuration,
  formatNumber,
  formatPercent,
  formatRatio,
} from './analytics-format';

describe('analytics formatting', () => {
  it('uses one explicit empty-value treatment across analytics workspaces', () => {
    expect(formatNumber('en', null)).toBe('—');
    expect(formatPercent('en', undefined)).toBe('—');
    expect(formatCurrency('en', null, 'DZD')).toBe('—');
    expect(formatDate('en', null)).toBe('—');
  });

  it('formats ratios, durations, and calendar days without changing their meaning', () => {
    expect(formatRatio('en', 1.25)).toBe('1.25×');
    expect(formatDuration('en', 950)).toBe('950 ms');
    expect(formatDuration('en', 1_500)).toBe('1.5 s');
    expect(formatDate('en', '2026-08-24')).toMatch(/Aug 24/);
    expect(formatDate('en', '2026-08-23T23:30:00.000Z', { includeTime: true })).toMatch(/Aug 24/);
  });

  it('retains the precision needed for small provider costs', () => {
    expect(formatCurrency('en-US', 0.0123, 'USD', { precision: 4 })).toContain('0.0123');
    expect(formatDzd('en-US', 12_500, true)).toMatch(/12\.5K/);
  });
});
