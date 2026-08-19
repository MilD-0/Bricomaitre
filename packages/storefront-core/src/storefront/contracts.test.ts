import { describe, expect, it } from 'vitest';

import { storefrontProductListQuerySchema } from './contracts';

describe('storefront product-list query contract', () => {
  it('keeps absent HTTP price filters nullable instead of coercing them to zero', () => {
    const query = storefrontProductListQuerySchema.parse({
      minPrice: null,
      maxPrice: null,
    });

    expect(query.minPrice).toBeNull();
    expect(query.maxPrice).toBeNull();
  });

  it('coerces actual numeric price query parameters', () => {
    const query = storefrontProductListQuerySchema.parse({
      minPrice: '1500',
      maxPrice: '7500',
    });

    expect(query.minPrice).toBe(1500);
    expect(query.maxPrice).toBe(7500);
  });
});
