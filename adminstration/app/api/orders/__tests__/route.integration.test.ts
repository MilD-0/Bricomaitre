import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '../route';

const { hasDbMock, getDbMock, authMock, canMutateResourceMock, requireMutationAccessMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  authMock: vi.fn(),
  canMutateResourceMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
}));

vi.mock('../../../../db/client', () => ({
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

describe('app/api/orders/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { permissions: ['orders_write'], isAllowed: true } });
    canMutateResourceMock.mockReset();
    canMutateResourceMock.mockReturnValue(true);
    requireMutationAccessMock.mockReset();
    requireMutationAccessMock.mockResolvedValue(null);
  });

  it('returns an empty payload when DB is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      writable: false,
      items: [],
      pagination: { page: 1, limit: 25, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
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
                    delPr: '200.00',
                    price: '1450.00',
                    note: 'Call first',
                    confirmed: 2,
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
      });

    getDbMock.mockReturnValue({ select: selectMock });

    const response = await GET();
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
                    cartProducts: ['f00000000000000000000005', '2'],
                    delivery: 0,
                    state: 16,
                    city: 'Algiers',
                    homeAddress: '15 Example street',
                    delPr: '100.00',
                    price: '750.00',
                    note: null,
                    confirmed: 1,
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
              mongoId: 'f00000000000000000000005',
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
      });

    getDbMock.mockReturnValue({ select: selectMock });

    const response = await GET();
    const payload = await response.json();

    expect(payload.items).toEqual([
      expect.objectContaining({
        id: 12,
        confirmed: 1,
        noAnswerCount: 2,
        orderProducts: [
          {
            productId: 31,
            brandId: 4,
            rawValue: 'f00000000000000000000005',
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

  it('excludes archived orders from the operational list', async () => {
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

  it('filters orders by confirmed status when provided', async () => {
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

    await GET(new NextRequest('http://localhost/api/orders?confirmed=3'));

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

    await GET(new NextRequest('http://localhost/api/orders?confirmed=1&noAnswerCount=3'));

    expect(countWhereMock).toHaveBeenCalledOnce();
    expect(rowsWhereMock).toHaveBeenCalledOnce();
  });
});
