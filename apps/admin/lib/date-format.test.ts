import { describe, expect, it } from 'vitest';

import { formatRelativeTime } from './date-format';

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-08-24T12:00:00.000Z');

  it('chooses the most useful unit for recent and older activity', () => {
    expect(formatRelativeTime('2026-08-24T11:59:40.000Z', 'en', now)).toBe('20 seconds ago');
    expect(formatRelativeTime('2026-08-24T10:00:00.000Z', 'en', now)).toBe('2 hours ago');
    expect(formatRelativeTime('2026-08-22T12:00:00.000Z', 'en', now)).toBe('2 days ago');
  });

  it('preserves localized relative-date vocabulary', () => {
    expect(formatRelativeTime('2026-08-25T12:00:00.000Z', 'fr', now)).toBe('demain');
  });
});
