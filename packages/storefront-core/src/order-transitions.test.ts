import { describe, expect, it } from 'vitest';

import {
  assertOrderStatusTransition,
  canTransitionOrderStatus,
  InvalidOrderStatusTransitionError,
  ORDER_STATUS,
  ORDER_STATUS_LABEL_KEYS,
} from './orders-support';

describe('order status transitions', () => {
  it('allows normal forward sales and carrier lifecycle transitions', () => {
    expect(canTransitionOrderStatus(ORDER_STATUS.NOT_CONTACTED, ORDER_STATUS.NO_ANSWER)).toBe(true);
    expect(canTransitionOrderStatus(ORDER_STATUS.NO_ANSWER, ORDER_STATUS.CONFIRMED)).toBe(true);
    expect(canTransitionOrderStatus(ORDER_STATUS.CONFIRMED, ORDER_STATUS.POSTED)).toBe(true);
    expect(canTransitionOrderStatus(ORDER_STATUS.POSTED, ORDER_STATUS.IN_DELIVERY)).toBe(true);
    expect(canTransitionOrderStatus(ORDER_STATUS.IN_DELIVERY, ORDER_STATUS.COMPLETED)).toBe(true);
  });

  it('allows carrier reconciliation to return an in-delivery order to dispatched', () => {
    expect(canTransitionOrderStatus(ORDER_STATUS.IN_DELIVERY, ORDER_STATUS.DISPATCHED)).toBe(true);
  });

  it('keeps terminal outcomes immutable without an explicit correction', () => {
    expect(() =>
      assertOrderStatusTransition(ORDER_STATUS.COMPLETED, ORDER_STATUS.CONFIRMED),
    ).toThrow(InvalidOrderStatusTransitionError);
    expect(() =>
      assertOrderStatusTransition(ORDER_STATUS.RETURNED, ORDER_STATUS.NOT_CONTACTED),
    ).toThrow('without a correction');
  });

  it('allows idempotent writes of the current status', () => {
    expect(canTransitionOrderStatus(ORDER_STATUS.RETURNED, ORDER_STATUS.RETURNED)).toBe(true);
  });

  it('publishes the stable status-to-label contract for consumers', () => {
    expect(ORDER_STATUS_LABEL_KEYS[ORDER_STATUS.POSTED]).toBe('posted');
    expect(ORDER_STATUS_LABEL_KEYS[ORDER_STATUS.MANUAL_COMPLETED]).toBe('manualCompleted');
  });
});
