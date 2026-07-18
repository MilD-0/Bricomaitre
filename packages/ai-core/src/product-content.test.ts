import { describe, expect, it } from 'vitest';

import { productContentChangesSchema, productContentGenerationInputSchema } from './product-content';

describe('product content AI contracts', () => {
  it('accepts localized content fields and rejects commercial fields', () => {
    expect(productContentChangesSchema.safeParse({ titleAr: 'مثقاب', description: 'Description factuelle.' }).success).toBe(true);
    expect(productContentChangesSchema.safeParse({ price: 10 }).success).toBe(false);
  });

  it('requires at least one requested field', () => {
    expect(productContentGenerationInputSchema.safeParse({
      product: { id: 1, title: 'Drill', titleAr: null, description: null, descriptionAr: null, category: 'Tools', brand: null, sku: null },
      fields: [],
    }).success).toBe(false);
  });
});
