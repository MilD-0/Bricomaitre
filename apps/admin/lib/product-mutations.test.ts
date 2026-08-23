import { describe, expect, it, vi } from 'vitest';

vi.mock('@bric/db/client', () => ({ getDb: () => ({}) }));

import { toProductMutationValues } from './product-mutations';
import { productPayloadSchema } from './products';

describe('product mutation values', () => {
  it('resolves a slug and formats every commercial amount for persistence', async () => {
    const values = await toProductMutationValues(
      productPayloadSchema.parse({
        title: 'Test Product',
        slug: 'Test Product',
        price: 12.3,
        oldPrice: 14,
        purchasePrice: 9.5,
        inventoryQuantity: 8,
      }),
    );

    expect(values).toMatchObject({
      title: 'Test Product',
      slug: 'test-product',
      price: '12.30',
      oldPrice: '14.00',
      purchasePrice: '9.50',
      inventoryQuantity: 8,
    });
  });
});
