import { describe, expect, it } from 'vitest';

import {
  formatBucket,
  formatCurrency,
  formatMilliseconds,
  formatNumber,
  formatPercent,
  formatUsd,
} from './stats-dashboard-primitives';

describe('stats dashboard presentation', () => {
  it('formats quantities, percentages, and currencies with bounded precision', () => {
    expect(formatNumber('en-US', 1234.9)).toBe('1,235');
    expect(formatPercent('en-US', 12.34)).toBe('12.3%');
    expect(formatCurrency('en-US', 1234.9)).toMatch(/DZD\s*1,235/);
    expect(formatUsd('en-US', 0.12345)).toBe('$0.1235');
    expect(formatUsd('en-US', null)).toBe('—');
  });

  it('uses milliseconds below one second and seconds above it', () => {
    expect(formatMilliseconds('en-US', 999)).toBe('999 ms');
    expect(formatMilliseconds('en-US', 1_250)).toBe('1.3 s');
  });

  it('formats daily and monthly report buckets while preserving unknown labels', () => {
    expect(formatBucket('en-US', '2026-03-02')).toBe('Mar 2');
    expect(formatBucket('en-US', '2026-03')).toBe('Mar 26');
    expect(formatBucket('en-US', 'lifetime')).toBe('lifetime');
  });
});
