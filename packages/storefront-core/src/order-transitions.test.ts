import { describe, expect, it } from 'vitest';

import {
  assertOrderStatusTransition,
  canTransitionOrderStatus,
  InvalidOrderStatusTransitionError,
} from './orders-support';

describe('order status transitions', () => {
  it('allows normal forward sales and carrier lifecycle transitions', () => {
    expect(canTransitionOrderStatus(0, 1)).toBe(true);
    expect(canTransitionOrderStatus(1, 2)).toBe(true);
    expect(canTransitionOrderStatus(2, 11)).toBe(true);
    expect(canTransitionOrderStatus(11, 7)).toBe(true);
    expect(canTransitionOrderStatus(7, 4)).toBe(true);
  });

  it('allows carrier reconciliation to return an in-delivery order to dispatched', () => {
    expect(canTransitionOrderStatus(7, 3)).toBe(true);
  });

  it('keeps terminal outcomes immutable without an explicit correction', () => {
    expect(() => assertOrderStatusTransition(4, 2)).toThrow(InvalidOrderStatusTransitionError);
    expect(() => assertOrderStatusTransition(8, 0)).toThrow('without a correction');
  });

  it('allows idempotent writes of the current status', () => {
    expect(canTransitionOrderStatus(8, 8)).toBe(true);
  });
});
