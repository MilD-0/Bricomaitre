import { describe, expect, it } from 'vitest';

import { isContentProposalFresh } from './ai-product-content';

describe('AI product content proposal freshness', () => {
  const now = new Date('2026-07-17T00:00:00.000Z');
  const sourceUpdatedAt = new Date('2026-07-16T00:00:00.000Z');

  it('accepts an unexpired proposal for the unchanged product version', () => {
    expect(isContentProposalFresh({
      sourceUpdatedAt,
      productUpdatedAt: new Date(sourceUpdatedAt),
      expiresAt: new Date('2026-07-18T00:00:00.000Z'),
      now,
    })).toBe(true);
  });

  it('rejects proposals after concurrent product edits', () => {
    expect(isContentProposalFresh({
      sourceUpdatedAt,
      productUpdatedAt: new Date('2026-07-16T01:00:00.000Z'),
      expiresAt: new Date('2026-07-18T00:00:00.000Z'),
      now,
    })).toBe(false);
  });

  it('rejects missing-version and expired proposals', () => {
    expect(isContentProposalFresh({ sourceUpdatedAt: null, productUpdatedAt: sourceUpdatedAt, expiresAt: new Date('2026-07-18T00:00:00.000Z'), now })).toBe(false);
    expect(isContentProposalFresh({ sourceUpdatedAt, productUpdatedAt: sourceUpdatedAt, expiresAt: now, now })).toBe(false);
  });
});
