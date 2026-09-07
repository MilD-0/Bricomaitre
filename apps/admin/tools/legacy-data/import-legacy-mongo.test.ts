import { describe, expect, it } from 'vitest';
import { hasOnlyBlockedCartRefs } from './import-legacy-mongo';

describe('legacy order rejection classification', () => {
  it('only permits explicitly skipped missing cart references, never missing phones', () => {
    expect(hasOnlyBlockedCartRefs([{ code: 'unmatched_cart_product' }])).toBe(true);
    expect(hasOnlyBlockedCartRefs([])).toBe(false);
    expect(
      hasOnlyBlockedCartRefs([{ code: 'unmatched_cart_product' }, { code: 'missing_phone' }]),
    ).toBe(false);
  });
});
