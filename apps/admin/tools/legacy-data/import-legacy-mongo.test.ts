import { describe, expect, it } from 'vitest';

import { hasOnlyBlockedCartRefs, shouldAbortForBlockedOrders } from './import-legacy-mongo';

describe('tools/legacy-data/import-legacy-mongo', () => {
  it('aborts by default when blocked orders are present', () => {
    expect(
      shouldAbortForBlockedOrders(
        { skipBlockedOrders: false },
        {
          orderDiagnostics: {
            skippedForState: [],
            blockedByCart: [{ mongoId: 'order-1', missingRefs: ['missing-product'] }],
          },
        },
      ),
    ).toBe(true);
  });

  it('allows write mode to continue when skipping blocked orders is enabled', () => {
    expect(
      shouldAbortForBlockedOrders(
        { skipBlockedOrders: true },
        {
          orderDiagnostics: {
            skippedForState: [],
            blockedByCart: [{ mongoId: 'order-1', missingRefs: ['missing-product'] }],
          },
        },
      ),
    ).toBe(false);
  });

  it('only treats unmatched cart-product errors as skippable', () => {
    expect(
      hasOnlyBlockedCartRefs([
        { code: 'unmatched_cart_product' },
        { code: 'unmatched_cart_product' },
      ]),
    ).toBe(true);

    expect(hasOnlyBlockedCartRefs([])).toBe(false);
    expect(
      hasOnlyBlockedCartRefs([{ code: 'unmatched_cart_product' }, { code: 'unexpected_error' }]),
    ).toBe(false);
  });
});
