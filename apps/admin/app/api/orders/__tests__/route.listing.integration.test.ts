import { PgDialect } from 'drizzle-orm/pg-core';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ORDER_STATUS } from '@bric/storefront-core/order-domain';

import { GET } from '../route';

const {
  hasDbMock,
  getDbMock,
  authMock,
  canMutateResourceMock,
  requireMutationAccessMock,
  createAdminOrderMock,
} = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  authMock: vi.fn(),
  canMutateResourceMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
  createAdminOrderMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('@/lib/auth', () => ({
  auth: authMock,
}));

vi.mock('@/lib/rbac', () => ({
  canMutateResource: canMutateResourceMock,
  requireMutationAccess: requireMutationAccessMock,
}));
vi.mock('@/lib/admin-order-lifecycle', () => ({
  createAdminOrder: createAdminOrderMock,
}));

describe('app/api/orders/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { permissions: ['orders_write'], isAllowed: true } });
    canMutateResourceMock.mockReset();
    canMutateResourceMock.mockReturnValue(true);
    requireMutationAccessMock.mockReset();
    requireMutationAccessMock.mockImplementation(async () => ({
      response: null,
      session: await authMock(),
    }));
    createAdminOrderMock.mockReset().mockResolvedValue({
      item: { id: 91 },
      duplicateCandidates: [],
    });
  });

  it('returns the operational order list', async () => {
    hasDbMock.mockReturnValue(true);
    const selectMock = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 0 }]),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      });

    getDbMock.mockReturnValue({ select: selectMock });

    const response = await GET(new NextRequest('http://localhost/api/orders'));

    await expect(response.json()).resolves.toEqual({
      writable: true,
      items: [],
      pagination: {
        page: 1,
        limit: 25,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
  });

  it('filters orders by inHouseStatus status when provided', async () => {
    hasDbMock.mockReturnValue(true);
    const countWhereMock = vi.fn().mockResolvedValue([{ value: 0 }]);
    const rowsWhereMock = vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          offset: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const historyWhereMock = vi.fn().mockResolvedValue([]);
    const selectMock = vi
      .fn()
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: countWhereMock }) })
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: rowsWhereMock }) })
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: historyWhereMock }) });

    getDbMock.mockReturnValue({ select: selectMock });

    await GET(new NextRequest('http://localhost/api/orders?inHouseStatus=3'));

    expect(countWhereMock).toHaveBeenCalledOnce();
    expect(rowsWhereMock).toHaveBeenCalledOnce();
  });

  it('accepts no-answer count filtering for no-answer orders', async () => {
    hasDbMock.mockReturnValue(true);
    const countWhereMock = vi.fn().mockResolvedValue([{ value: 0 }]);
    const rowsWhereMock = vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          offset: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const historyWhereMock = vi.fn().mockResolvedValue([]);
    const selectMock = vi
      .fn()
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: countWhereMock }) })
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: rowsWhereMock }) })
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: historyWhereMock }) });

    getDbMock.mockReturnValue({ select: selectMock });

    await GET(new NextRequest('http://localhost/api/orders?inHouseStatus=1&noAnswerCount=3'));

    expect(countWhereMock).toHaveBeenCalledOnce();
    expect(rowsWhereMock).toHaveBeenCalledOnce();
  });

  it('filters the terminal no-answer bucket by a minimum count', async () => {
    hasDbMock.mockReturnValue(true);
    const countWhereMock = vi.fn().mockResolvedValue([{ value: 0 }]);
    const rowsWhereMock = vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          offset: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const selectMock = vi
      .fn()
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: countWhereMock }) })
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: rowsWhereMock }) });

    getDbMock.mockReturnValue({ select: selectMock });

    await GET(new NextRequest('http://localhost/api/orders?inHouseStatus=1&noAnswerCountMin=3'));

    const whereClause = countWhereMock.mock.calls[0]?.[0];
    const built = new PgDialect().sqlToQuery(whereClause);
    expect(built.sql).toContain('"orders"."no_answer_count" >= $');
    expect(built.params).toEqual(expect.arrayContaining([ORDER_STATUS.NO_ANSWER, 3]));
    expect(rowsWhereMock).toHaveBeenCalledOnce();
  });
});
