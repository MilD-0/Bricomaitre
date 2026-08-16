import { describe, expect, it } from 'vitest';

import {
  createRequestedProductContentChangesSchema,
  PRODUCT_CONTENT_GENERATION_INSTRUCTIONS,
  productContentChangesSchema,
  productContentGenerationInputSchema,
} from './product-content';

describe('product content AI contracts', () => {
  it('accepts localized content fields and rejects commercial fields', () => {
    expect(
      productContentChangesSchema.safeParse({
        titleAr: 'مثقاب',
        description: 'Description factuelle.',
      }).success,
    ).toBe(true);
    expect(productContentChangesSchema.safeParse({ price: 10 }).success).toBe(false);
  });

  it('requires at least one requested field', () => {
    expect(
      productContentGenerationInputSchema.safeParse({
        product: {
          id: 1,
          title: 'Drill',
          titleAr: null,
          description: null,
          descriptionAr: null,
          category: 'Tools',
          brand: null,
          sku: null,
        },
        fields: [],
      }).success,
    ).toBe(false);
  });

  it('requires every requested field and rejects unrequested output fields', () => {
    const requested = createRequestedProductContentChangesSchema(['titleAr', 'descriptionAr']);

    expect(requested.safeParse({ titleAr: 'مثقاب', descriptionAr: 'وصف واضح.' }).success).toBe(
      true,
    );
    expect(requested.safeParse({ titleAr: 'مثقاب' }).success).toBe(false);
    expect(
      requested.safeParse({ titleAr: 'مثقاب', descriptionAr: 'وصف واضح.', title: 'Drill' }).success,
    ).toBe(false);
  });

  it('keeps limitations out of customer-facing generated fields', () => {
    expect(PRODUCT_CONTENT_GENERATION_INSTRUCTIONS).toContain(
      'existing French field as the factual source',
    );
    expect(PRODUCT_CONTENT_GENERATION_INSTRUCTIONS).toContain('never meta commentary');
    expect(PRODUCT_CONTENT_GENERATION_INSTRUCTIONS).toContain(
      'explain any limitation only in reasoning',
    );
  });
});
