import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { hasDbMock, getDbMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
}));

vi.mock('../../../../db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

describe('app/api/entities/stats/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
  });

  it('returns zeros when the database is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ products: 0, orders: 0, assets: 0 });
  });

  it('counts all orders in overview stats', async () => {
    hasDbMock.mockReturnValue(true);

    const fromMock = vi.fn()
      .mockReturnValueOnce(Promise.resolve([{ value: 11 }]))
      .mockReturnValueOnce(Promise.resolve([{ value: 3 }]))
      .mockReturnValueOnce(Promise.resolve([{ value: 2 }]))
      .mockReturnValueOnce(Promise.resolve([{ value: 1 }]))
      .mockReturnValueOnce(Promise.resolve([{ value: 4 }]));

    const selectMock = vi.fn(() => ({ from: fromMock }));

    getDbMock.mockReturnValue({ select: selectMock });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      products: 11,
      orders: 3,
      assets: 7,
    });
  });
});
