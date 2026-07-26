import { describe, expect, it } from 'vitest';

import { productCategorizationDecisionSchema, productCategorizationInputSchema } from './product-categorization';

describe('product categorization contracts', () => {
  it('accepts a grounded category decision', () => {
    expect(productCategorizationDecisionSchema.parse({
      categoryId: 12,
      confidence: 0.91,
      ambiguous: false,
      reasoning: 'The title explicitly identifies a cordless drill.',
    })).toMatchObject({ categoryId: 12, ambiguous: false });
  });

  it('requires ambiguous decisions to omit a category', () => {
    expect(() => productCategorizationDecisionSchema.parse({
      categoryId: 12,
      confidence: 0.4,
      ambiguous: true,
      reasoning: 'Could fit two categories.',
    })).toThrow();
    expect(productCategorizationDecisionSchema.parse({
      categoryId: null,
      confidence: 0.4,
      ambiguous: true,
      reasoning: 'Could fit two categories.',
    }).categoryId).toBeNull();
  });

  it('requires at least one supplied category candidate', () => {
    expect(() => productCategorizationInputSchema.parse({
      product: {
        id: 1,
        title: 'Drill',
        description: null,
        brand: null,
        sku: null,
        currentCategoryId: null,
        currentCategory: null,
      },
      categories: [],
    })).toThrow();
  });
});
