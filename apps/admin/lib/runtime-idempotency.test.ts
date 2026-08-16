import { describe, expect, it } from 'vitest';

import { buildIdempotencyKeyHash } from '@bric/runtime/idempotency';

describe('idempotency key hashing', () => {
  it('produces a deterministic one-way storage key without retaining the caller token', () => {
    const hash = buildIdempotencyKeyHash('checkout-submission-token');

    expect(hash).toHaveLength(64);
    expect(hash).toBe(buildIdempotencyKeyHash('checkout-submission-token'));
    expect(hash).not.toContain('checkout-submission-token');
  });
});
