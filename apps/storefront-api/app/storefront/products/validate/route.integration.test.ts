import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ products: vi.fn(), promo: vi.fn(), promos: vi.fn(), db: {} }));
vi.mock('@bric/db/client', () => ({ hasDb: () => true, getDb: () => mocks.db }));
vi.mock('@bric/storefront-core/catalog', () => ({ readStorefrontProductsByIds: mocks.products }));
vi.mock('@bric/storefront-core/promos', () => ({
  resolveOrderPromo: mocks.promo,
  resolveProductPromos: mocks.promos,
}));
import { POST } from './route';

describe('public cart validation', () => {
  beforeEach(() => {
    mocks.products.mockReset().mockResolvedValue([{ id: 12, price: '1500' }]);
    mocks.promo.mockReset().mockResolvedValue(null);
    mocks.promos.mockReset().mockResolvedValue([]);
  });

  it('rejects malformed JSON without resolving products or discounts', async () => {
    const response = await POST(
      new Request('http://localhost/storefront/products/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.products).not.toHaveBeenCalled();
    expect(mocks.promo).not.toHaveBeenCalled();
    expect(mocks.promos).not.toHaveBeenCalled();
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
    expect(await response.json()).toEqual({
      items: [{ id: 12, price: '1500' }],
      promo,
      promos: [],
    });
    expect(mocks.promo).toHaveBeenCalledWith(mocks.db, {
      cartProducts: ['12', '13'],
      promoCode: 'AUDIT10',
    });
  });

  it('validates exact product offers together and ignores an offer outside the cart', async () => {
    const offers = [
      { productId: 12, code: 'SAME' },
      { productId: 13, code: 'OTHER' },
    ];
    mocks.promos.mockResolvedValue(offers.map((offer) => ({ ...offer, promoPrice: 1200 })));
    const response = await POST(
      new Request('http://localhost/storefront/products/validate', {
        method: 'POST',
        body: JSON.stringify({
          productIds: [12, 13],
          productPromos: [...offers, { productId: 99, code: 'OUTSIDE' }],
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.promos).toHaveBeenCalledWith(mocks.db, { productPromos: offers });
    expect(mocks.promo).not.toHaveBeenCalled();
    expect((await response.json()).promos).toHaveLength(2);
  });

  it('rejects two offers on the same product rather than choosing by array order', async () => {
    const response = await POST(
      new Request('http://localhost/storefront/products/validate', {
        method: 'POST',
        body: JSON.stringify({
          productIds: [12],
          productPromos: [
            { productId: 12, code: 'A' },
            { productId: 12, code: 'B' },
          ],
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.promos).not.toHaveBeenCalled();
  });

  it('returns no discount when the promotion expired', async () => {
    const response = await POST(
      new Request('http://localhost/storefront/products/validate', {
        method: 'POST',
        body: JSON.stringify({ productIds: [12], promoCode: 'EXPIRED' }),
      }),
    );
    expect(await response.json()).toEqual({
      items: [{ id: 12, price: '1500' }],
      promo: null,
      promos: [],
    });
  });
});
