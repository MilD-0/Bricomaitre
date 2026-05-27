import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';
import { GET as ALIAS_GET } from '../../../../api/storefront/products/[id]/promo/route';

const { hasDbMock, getDbMock, readActiveProductPromoMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  readActiveProductPromoMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('@bric/storefront-core/promos', () => ({
  readActiveProductPromo: readActiveProductPromoMock,
}));

describe('app/storefront/products/[id]/promo/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    readActiveProductPromoMock.mockReset();
  });

  it('returns a valid product promo shape', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ tag: 'db' });
    readActiveProductPromoMock.mockResolvedValue({
      code: 'Spring-50',
      productId: 123,
      originalPrice: 1200,
      promoPrice: 999,
      discountAmount: 201,
    });

    const res = await GET(new NextRequest('http://localhost/storefront/products/123/promo?code=spring-50'), {
      params: Promise.resolve({ id: '123' }),
    });

    expect(readActiveProductPromoMock).toHaveBeenCalledWith(
      { tag: 'db' },
      expect.objectContaining({ productId: 123, code: 'spring-50' }),
    );
    await expect(res.json()).resolves.toEqual({
      ok: true,
      promo: {
        code: 'Spring-50',
        productId: 123,
        originalPrice: 1200,
        promoPrice: 999,
        discountAmount: 201,
      },
    });
  });

  it('returns an empty promo response for invalid promo codes', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ tag: 'db' });
    readActiveProductPromoMock.mockResolvedValue(null);

    const res = await GET(new NextRequest('http://localhost/storefront/products/123/promo?code=bad'), {
      params: Promise.resolve({ id: '123' }),
    });

    await expect(res.json()).resolves.toEqual({ ok: false, promo: null });
  });

  it('exports the canonical GET handler from the compatibility alias', () => {
    expect(ALIAS_GET).toBe(GET);
  });
});
