import { describe, expect, it, vi } from 'vitest';

import { getOrderProductLookup } from '@bric/storefront-core/order-records';
import { resolveOrderLineSnapshots } from '@bric/storefront-core/meta';

const product = {
  id: 19564,
  mongoId: null,
  brandId: 12,
  slug: 'arrache-poulie-41326-06',
  title: 'ARRACHE POULIE 41326-06',
  price: '5600.00',
  images: ['https://cdn.example.test/product.webp'],
};

function productSelectDb(row = product) {
  const where = vi.fn().mockResolvedValue([row]);
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { db: { select }, select, where };
}

describe('order product resolution', () => {
  it('resolves canonical storefront slugs into durable order-line snapshots', async () => {
    const { db, where } = productSelectDb();

    const lines = await resolveOrderLineSnapshots(db as never, {
      cartProducts: ['arrache-poulie-41326-06', 'arrache-poulie-41326-06'],
      promoCode: null,
    });

    expect(where).toHaveBeenCalledOnce();
    expect(lines).toEqual([expect.objectContaining({
      productId: 19564,
      contentId: '19564',
      rawValue: 'arrache-poulie-41326-06',
      title: 'ARRACHE POULIE 41326-06',
      effectiveUnitPrice: 5600,
      quantity: 2,
      lineTotal: 11200,
      thumbnailUrl: 'https://cdn.example.test/product.webp',
    })]);
  });

  it('indexes slug-backed products when reading existing orders', async () => {
    const { db } = productSelectDb();

    const lookup = await getOrderProductLookup(db as never, [{
      cartProducts: ['arrache-poulie-41326-06'],
    }]);

    expect(lookup.get('slug:arrache-poulie-41326-06')).toEqual(expect.objectContaining({
      id: 19564,
      title: 'ARRACHE POULIE 41326-06',
      price: 5600,
      thumbnailUrl: 'https://cdn.example.test/product.webp',
    }));
  });
});
