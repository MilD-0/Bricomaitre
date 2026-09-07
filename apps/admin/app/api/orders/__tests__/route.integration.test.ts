import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    expect(createAdminOrderMock).toHaveBeenCalledWith(
      db,
      input,
      {
        email: 'admin@example.com',
        name: 'Admin',
      },
      expect.any(Date),
      undefined,
    );
    await expect(response.json()).resolves.toEqual({
      ok: true,
      item: { id: 91 },
      duplicateCandidates: [],
    });
  });

  it('passes a valid creation attempt ID and rejects malformed attempt IDs before creating', async () => {
    hasDbMock.mockReturnValue(true);
    const db = { marker: 'attempt-database' };
    getDbMock.mockReturnValue(db);
    const requestId = '7f26f194-a92d-4b61-beb0-a57d550d4e91';
    const input = { phoneNumber1: '0550123456', cartProducts: ['12'], requestId };
    const response = await POST(
      new NextRequest('http://localhost/api/orders', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
    expect(response.status).toBe(201);
    expect(createAdminOrderMock).toHaveBeenLastCalledWith(
      db,
      expect.objectContaining(input),
      expect.any(Object),
      expect.any(Date),
      requestId,
    );
    createAdminOrderMock.mockClear();
    const invalid = await POST(
      new NextRequest('http://localhost/api/orders', {
        method: 'POST',
        body: JSON.stringify({ ...input, requestId: 'bad' }),
      }),
    );
    expect(invalid.status).toBe(400);
    expect(createAdminOrderMock).not.toHaveBeenCalled();
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
});
