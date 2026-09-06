import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({ access: vi.fn(), getDb: vi.fn(), hasDb: vi.fn() }));
vi.mock('../../../../lib/rbac', () => ({ requireMutationAccess: mocks.access }));
vi.mock('@bric/db/client', () => ({ getDb: mocks.getDb, hasDb: mocks.hasDb }));
const request = (body: unknown) =>
  new NextRequest('http://localhost/api/orders/shopping-list-details', {
    method: 'POST',
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.hasDb.mockReturnValue(true);
});

it('checks order access before reading catalog details', async () => {
  mocks.access.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
  expect((await POST(request({ productIds: [1], brandIds: [] }))).status).toBe(403);
  expect(mocks.getDb).not.toHaveBeenCalled();
});

it('rejects invalid or oversized IDs', async () => {
  for (const productIds of [[-1], ['1'], Array(10001).fill(1)]) {
    expect((await POST(request({ productIds, brandIds: [] }))).status).toBe(400);
  }
  expect(mocks.getDb).not.toHaveBeenCalled();
});

it('loads hundreds of products and brands with two database queries', async () => {
  const productRows = Array.from({ length: 500 }, (_, index) => ({
    id: index + 1,
    inventoryQuantity: 2,
    purchasePrice: '10',
  }));
  const where = vi
    .fn()
    .mockResolvedValueOnce(productRows)
    .mockResolvedValueOnce([{ id: 1, name: 'Bosch' }]);
  const select = vi.fn(() => ({ from: () => ({ where }) }));
  mocks.getDb.mockReturnValue({ select });
  const result = await POST(
    request({ productIds: productRows.map((row) => row.id), brandIds: [1] }),
  );
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({
    products: productRows,
    brands: [{ id: 1, name: 'Bosch' }],
  });
  expect(select).toHaveBeenCalledTimes(2);
});
