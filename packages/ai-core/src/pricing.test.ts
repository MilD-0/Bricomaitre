import { describe, expect, it } from 'vitest';
import { evaluateDiscountPrice, minimumSellingPriceForMargin } from './pricing';

describe('AI pricing policy', () => {
  it('uses a 15 percent default gross margin', () => {
    expect(minimumSellingPriceForMargin({ purchaseCost: 85 })).toBe(100);
  });

  it('supports request-scoped margin overrides', () => {
    expect(minimumSellingPriceForMargin({ purchaseCost: 90, minimumGrossMargin: 0.1 })).toBe(100);
  });

  it('rejects prices below the selected margin floor', () => {
    expect(evaluateDiscountPrice({ purchaseCost: 85, proposedPrice: 99 }).allowed).toBe(false);
  });
});
