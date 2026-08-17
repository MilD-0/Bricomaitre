import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { getDbMock, hasDbMock, readActiveProductPromoMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  hasDbMock: vi.fn(),
  readActiveProductPromoMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  getDb: getDbMock,
  hasDb: hasDbMock,
}));

vi.mock('@bric/storefront-core/promos', () => ({
  readActiveProductPromo: readActiveProductPromoMock,
}));

describe('GET /storefront/products/[id]/promo', () => {
  beforeEach(() => {
    getDbMock.mockReset();
    hasDbMock.mockReset().mockReturnValue(true);
    readActiveProductPromoMock.mockReset();
  });

  it('returns 400 before data access for a malformed product id', async () => {
    const response = await GET(
      new NextRequest('http://localhost/storefront/products/nope/promo?code=SAVE10'),
      { params: Promise.resolve({ id: 'nope' }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid product id.' });
    expect(getDbMock).not.toHaveBeenCalled();
    expect(readActiveProductPromoMock).not.toHaveBeenCalled();
  });

  it('returns the active promotion for a valid product id and code', async () => {
    const db = { marker: 'db' };
    const promo = { code: 'SAVE10', promoPrice: '900.00' };
    getDbMock.mockReturnValue(db);
    readActiveProductPromoMock.mockResolvedValue(promo);

    const response = await GET(
      new NextRequest('http://localhost/storefront/products/12/promo?code=SAVE10'),
      { params: Promise.resolve({ id: '12' }) },
    );

    expect(readActiveProductPromoMock).toHaveBeenCalledWith(db, {
      productId: 12,
      code: 'SAVE10',
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, promo });
  });
});
