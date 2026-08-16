import { describe, expect, it } from 'vitest';

import { getCustomerOrderTrackingState } from './order-tracking';

describe('customer order tracking state', () => {
  it.each([
    [0, 0, 'waiting'],
    [1, 0, 'waiting'],
    [2, 1, 'preparing'],
    [11, 1, 'preparing'],
    [3, 2, 'onWay'],
    [7, 2, 'onWay'],
    [4, 3, 'delivered'],
    [10, 3, 'delivered'],
  ] as const)('maps internal status %s to customer stage %s', (status, activeStage, current) => {
    expect(getCustomerOrderTrackingState(status)).toMatchObject({
      activeStage,
      current,
      variant: 'progress',
    });
  });

  it.each([
    [5, 'delayed'],
    [6, 'cancelled'],
    [8, 'returned'],
    [9, 'failed'],
  ] as const)('keeps customer-relevant exception status %s explicit', (status, variant) => {
    expect(getCustomerOrderTrackingState(status).variant).toBe(variant);
  });
});
