import { describe, expect, it } from 'vitest';

import { lightweightJobId } from './jobs';

describe('lightweight queue jobs', () => {
  it('derives stable BullMQ-safe IDs without exposing the source key', () => {
    const first = lightweightJobId('storefront-analytics', 'customer-visible-event-id');
    const second = lightweightJobId('storefront-analytics', 'customer-visible-event-id');

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain('customer-visible-event-id');
  });

  it('scopes the same dedupe key to its queue', () => {
    expect(lightweightJobId('queue-a', 'event-1')).not.toBe(lightweightJobId('queue-b', 'event-1'));
  });
});
