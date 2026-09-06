import { NextRequest } from 'next/server';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ORDER_STATUS } from '@bric/storefront-core/order-domain';

import { GET, POST } from '../route';

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

vi.mock('../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../lib/rbac', () => ({
  canMutateResource: canMutateResourceMock,
  requireMutationAccess: requireMutationAccessMock,
}));
vi.mock('../../../../lib/admin-order-lifecycle', () => ({
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

  it('returns an empty payload when DB is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    const response = await GET(new NextRequest('http://localhost/api/orders'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      writable: false,
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

  it('returns 400 for malformed list queries', async () => {
    hasDbMock.mockReturnValue(true);

    const response = await GET(new NextRequest('http://localhost/api/orders?page=0'));

    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty('error');
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it('creates through the shared canonical admin-order workflow', async () => {
    hasDbMock.mockReturnValue(true);
    const db = { marker: 'database' };
    getDbMock.mockReturnValue(db);
    authMock.mockResolvedValue({
      user: { email: 'admin@example.com', name: 'Admin', permissions: ['orders_write'] },
    });
    const input = {
      firstName: 'Ahmed',
      lastName: null,
      email: null,
      phoneNumber1: '0550123456',
      phoneNumber2: null,
      cartProducts: ['12'],
      delivery: 0,
      state: 16,
      city: 'Bab Ezzouar',
      homeAddress: '12 rue des Outils',
      note: null,
      promoCode: null,
      visitId: null,
      journeyId: null,
      sessionId: null,
    };

    const response = await POST(
      new NextRequest('http://localhost/api/orders', {
        method: 'POST',
        body: JSON.stringify(input),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(201);
    expect(createAdminOrderMock).toHaveBeenCalledWith(db, input, {
      email: 'admin@example.com',
      name: 'Admin',
    });
    await expect(response.json()).resolves.toEqual({
      ok: true,
      item: { id: 91 },
      duplicateCandidates: [],
    });
  });

  it('serializes orders with status history and amounts', async () => {
    hasDbMock.mockReturnValue(true);
    const selectMock = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 1 }]),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([
                  {
                    id: 11,
                    firstName: 'Ada',
                    lastName: 'Lovelace',
                    phoneNumber1: '0550123456',
                    phoneNumber2: null,
                    cartProducts: ['1', '2'],
                    delivery: 1,
                    state: 16,
                    city: 'Bab Ezzouar',
                    homeAddress: '12 Example street',
                    deliveryFee: '200.00',
                    price: '1450.00',
                    note: 'Call first',
                    inHouseStatus: 2,
                    noAnswerCount: 0,
                    confirmedBy: 'admin@example.com',
                    confirmedByName: 'Admin',
                    confirmedAt: new Date('2026-03-10T09:15:00.000Z'),
                    createdAt: new Date('2026-03-09T08:00:00.000Z'),
                    updatedAt: new Date('2026-03-10T09:15:00.000Z'),
                  },
                ]),
              }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ orderId: 11 }]),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: 1,
              mongoId: null,
              brandId: 10,
              title: 'Chair',
              price: 600,
              images: ['https://cdn.example.com/chair.jpg'],
            },
            {
              id: 2,
              mongoId: null,
              brandId: null,
              title: 'Desk',
              price: 450,
              images: ['https://cdn.example.com/desk.jpg'],
            },
          ]),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

    getDbMock.mockReturnValue({ select: selectMock });

    const response = await GET(new NextRequest('http://localhost/api/orders'));
    const payload = await response.json();

    expect(payload.writable).toBe(true);
    expect(payload.pagination).toEqual({
      page: 1,
      limit: 25,
      totalItems: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });
    expect(payload.items).toEqual([
      expect.objectContaining({
        id: 11,
        fullName: 'Ada Lovelace',
        orderProducts: [
          {
            productId: 1,
            brandId: 10,
            rawValue: '1',
            title: 'Chair',
            unitPrice: 600,
            quantity: 1,
            lineTotal: 600,
            thumbnailUrl: 'https://cdn.example.com/chair.jpg',
            missing: false,
          },
          {
            productId: 2,
            brandId: null,
            rawValue: '2',
            title: 'Desk',
            unitPrice: 450,
            quantity: 1,
            lineTotal: 450,
            thumbnailUrl: 'https://cdn.example.com/desk.jpg',
            missing: false,
          },
        ],
        subtotalOverride: 1450,
        productSubtotal: 1450,
        deliveryFee: 200,
        totalAmount: 1650,
        hasStatusHistory: true,
        statusHistory: [],
      }),
    ]);
  });

  it('matches Mongo-like cart product ids against products.mongo_id', async () => {
    hasDbMock.mockReturnValue(true);
    const selectMock = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 1 }]),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([
                  {
                    id: 12,
                    firstName: 'Grace',
                    lastName: 'Hopper',
                    phoneNumber1: '0660000000',
                    phoneNumber2: null,
                    cartProducts: ['696b80ad978cdf3fa9f5915a', '2'],
                    delivery: 0,
                    state: 16,
                    city: 'Algiers',
                    homeAddress: '15 Example street',
                    deliveryFee: '100.00',
                    price: '750.00',
                    note: null,
                    inHouseStatus: 1,
                    noAnswerCount: 2,
                    confirmedBy: null,
                    confirmedByName: null,
                    confirmedAt: null,
                    createdAt: new Date('2026-03-09T08:00:00.000Z'),
                    updatedAt: new Date('2026-03-10T09:15:00.000Z'),
                  },
                ]),
              }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: 31,
              mongoId: '696b80ad978cdf3fa9f5915a',
              brandId: 4,
              title: 'Legacy Lamp',
              price: 300,
              images: ['https://cdn.example.com/lamp.jpg'],
            },
            {
              id: 2,
              mongoId: null,
              brandId: null,
              title: 'Desk',
              price: 450,
              images: ['https://cdn.example.com/desk.jpg'],
            },
          ]),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

    getDbMock.mockReturnValue({ select: selectMock });

    const response = await GET(new NextRequest('http://localhost/api/orders'));
    const payload = await response.json();

    expect(payload.items).toEqual([
      expect.objectContaining({
        id: 12,
        inHouseStatus: 1,
        noAnswerCount: 2,
        orderProducts: [
          {
            productId: 31,
            brandId: 4,
            rawValue: '696b80ad978cdf3fa9f5915a',
            title: 'Legacy Lamp',
            unitPrice: 300,
            quantity: 1,
            lineTotal: 300,
            thumbnailUrl: 'https://cdn.example.com/lamp.jpg',
            missing: false,
          },
          {
            productId: 2,
            brandId: null,
            rawValue: '2',
            title: 'Desk',
            unitPrice: 450,
            quantity: 1,
            lineTotal: 450,
            thumbnailUrl: 'https://cdn.example.com/desk.jpg',
            missing: false,
          },
        ],
        productSubtotal: 750,
        deliveryFee: 100,
        totalAmount: 850,
      }),
    ]);
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
