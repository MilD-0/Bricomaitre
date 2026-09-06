import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ products: vi.fn(), promo: vi.fn(), db: {} }));
vi.mock('@bric/db/client', () => ({ hasDb: () => true, getDb: () => mocks.db }));
vi.mock('@bric/storefront-core/catalog', () => ({ readStorefrontProductsByIds: mocks.products }));
vi.mock('@bric/storefront-core/promos', () => ({ resolveOrderPromo: mocks.promo }));
import { POST } from './route';

describe('public cart validation', () => {
  beforeEach(() => {
    mocks.products.mockReset().mockResolvedValue([{ id: 12, price: '1500' }]);
    mocks.promo.mockReset().mockResolvedValue(null);
  });

  it('uses canonical promo resolution for the actual cart and returns the quote with products', async () => {
    const promo = { code: 'AUDIT10', productId: 12, promoPrice: 1200 };
    mocks.promo.mockResolvedValue(promo);
    const response = await POST(
      new Request('http://localhost/storefront/products/validate', {
        method: 'POST',
        body: JSON.stringify({ productIds: [12, 13], promoCode: 'AUDIT10', promoPrice: 1 }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [{ id: 12, price: '1500' }], promo });
    expect(mocks.promo).toHaveBeenCalledWith(mocks.db, {
      cartProducts: ['12', '13'],
      promoCode: 'AUDIT10',
    });
  });

  it('returns no discount when the promotion expired', async () => {
    const response = await POST(
      new Request('http://localhost/storefront/products/validate', {
        method: 'POST',
        body: JSON.stringify({ productIds: [12], promoCode: 'EXPIRED' }),
      }),
    );
    expect(await response.json()).toEqual({ items: [{ id: 12, price: '1500' }], promo: null });
  });
});
