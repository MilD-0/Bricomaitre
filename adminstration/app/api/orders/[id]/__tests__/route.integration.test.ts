import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, GET, PATCH, POST } from '../route';
import { orderPatchSchema } from '../../../../../lib/orders';

const {
  ensureOrderConfirmedEventForOrderMock,
  ensureOrderCompletedEventForOrderMock,
  ensureMarketingOrderStatusEventsMock,
  hasDbMock,
  getDbMock,
  requireMutationAccessMock,
  authMock,
  mutateEntityWithHistoryMock,
  readEcotrackCatalogMock,
} = vi.hoisted(() => ({
  ensureOrderConfirmedEventForOrderMock: vi.fn(),
  ensureOrderCompletedEventForOrderMock: vi.fn(),
  ensureMarketingOrderStatusEventsMock: vi.fn(),
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
  authMock: vi.fn(),
  mutateEntityWithHistoryMock: vi.fn(),
  readEcotrackCatalogMock: vi.fn(),
}));

vi.mock('@bric/storefront-core/meta', () => ({
  ensureOrderConfirmedEventForOrder: ensureOrderConfirmedEventForOrderMock,
  ensureOrderCompletedEventForOrder: ensureOrderCompletedEventForOrderMock,
  isMetaOrderConfirmedStatus: (status: number) => status === 2,
  isMetaCompletedStatus: (status: number) => status === 4 || status === 10,
}));

vi.mock('@bric/storefront-core/marketing', () => ({
  ensureMarketingOrderStatusEvents: ensureMarketingOrderStatusEventsMock,
}));

vi.mock('../../../../../db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('../../../../../lib/rbac', () => ({
  requireMutationAccess: requireMutationAccessMock,
}));

vi.mock('../../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../../lib/action-history', () => ({
  mutateEntityWithHistory: mutateEntityWithHistoryMock,
}));

vi.mock('../../../../../lib/ecotrack', () => ({
  readEcotrackCatalog: readEcotrackCatalogMock,
  resolveEcotrackDeliveryFee: vi.fn((catalog, wilayaId, deliveryType) => {
    const fee = catalog.serviceFees.find((entry: { serviceType: string; wilayaId: number }) => entry.serviceType === 'livraison' && entry.wilayaId === wilayaId);
    return deliveryType === 0 ? Number(fee?.homeFee ?? 0) : Number(fee?.stopDeskFee ?? 0);
  }),
}));

describe('app/api/orders/[id]/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    requireMutationAccessMock.mockReset();
    requireMutationAccessMock.mockResolvedValue(null);
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { email: 'admin@example.com', name: 'Admin' } });
    mutateEntityWithHistoryMock.mockReset();
    readEcotrackCatalogMock.mockReset();
    ensureOrderConfirmedEventForOrderMock.mockReset();
    ensureOrderConfirmedEventForOrderMock.mockResolvedValue({ created: true });
    ensureOrderCompletedEventForOrderMock.mockReset();
    ensureOrderCompletedEventForOrderMock.mockResolvedValue({ created: true });
    ensureMarketingOrderStatusEventsMock.mockReset();
    ensureMarketingOrderStatusEventsMock.mockResolvedValue({ created: true });
    readEcotrackCatalogMock.mockResolvedValue({
      wilayas: [],
      communes: [],
      serviceFees: [
        { serviceType: 'livraison', wilayaId: 31, homeFee: '400', stopDeskFee: '350' },
      ],
      weightFees: [],
      lastSync: null,
    });
  });

  it('returns RBAC denial for PATCH', async () => {
    requireMutationAccessMock.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));

    const response = await PATCH(
      new NextRequest('http://localhost/api/orders/7', {
        method: 'PATCH',
        body: JSON.stringify({ note: 'x' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '7' }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('issues an opaque tracking token for an imported order that does not have one', async () => {
    hasDbMock.mockReturnValue(true);
    let issuedToken = '';
    const returning = vi.fn(async () => [{ publicToken: issuedToken }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn((values: { publicToken: string }) => {
      issuedToken = values.publicToken;
      return { where };
    });
    const db = {
      query: { orders: { findFirst: vi.fn().mockResolvedValue({ id: 7, publicToken: null }) } },
      update: vi.fn().mockReturnValue({ set }),
    };
    getDbMock.mockReturnValue(db);

    const response = await POST(new NextRequest('http://localhost/api/orders/7', { method: 'POST' }), {
      params: Promise.resolve({ id: '7' }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true, publicToken: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ publicToken: body.publicToken }));
  });

  it('loads a single order with full status history', async () => {
    hasDbMock.mockReturnValue(true);
    const order = {
      id: 7,
      firstName: 'Grace',
      lastName: 'Hopper',
      phoneNumber1: '0550111111',
      phoneNumber2: null,
      cartProducts: ['8'],
      delivery: 0,
      state: 31,
      city: 'Bir El Djir',
      homeAddress: 'Street 5',
      delPr: '150.00',
      price: '1200.00',
      note: null,
      confirmed: 2,
      noAnswerCount: 0,
      confirmedBy: 'admin@example.com',
      confirmedByName: 'Admin',
      confirmedAt: new Date('2026-03-02T11:00:00.000Z'),
      createdAt: new Date('2026-03-01T10:00:00.000Z'),
      updatedAt: new Date('2026-03-02T11:00:00.000Z'),
    };
    const db = {
      query: {
        orders: {
          findFirst: vi.fn().mockResolvedValue(order),
        },
      },
      select: vi.fn().mockReturnValue({
        from: vi.fn()
          .mockReturnValueOnce({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([
                {
                  id: 3,
                  orderId: 7,
                  status: 2,
                  noAnswerCount: 0,
                  changedBy: 'admin@example.com',
                  changedByName: 'Admin',
                  changedAt: new Date('2026-03-02T11:00:00.000Z'),
                },
              ]),
            }),
          })
          .mockReturnValueOnce({
            where: vi.fn().mockResolvedValue([
              {
                id: 8,
                mongoId: null,
                brandId: null,
                title: 'Keyboard',
                price: 800,
                images: ['https://cdn.example.com/keyboard.jpg'],
              },
            ]),
          }),
      }),
    };

    getDbMock.mockReturnValue(db);

    const response = await GET(new NextRequest('http://localhost/api/orders/7'), {
      params: Promise.resolve({ id: '7' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        item: expect.objectContaining({
          id: 7,
          hasStatusHistory: true,
          statusHistory: [
            expect.objectContaining({
              id: 3,
              status: 2,
              noAnswerCount: 0,
            }),
          ],
        }),
      }),
    );
  });

  it('returns validation errors for invalid PATCH payloads', async () => {
    hasDbMock.mockReturnValue(true);
    vi.spyOn(orderPatchSchema, 'safeParse').mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: { phoneNumber1: ['required'] } }) },
    } as never);

    const response = await PATCH(
      new NextRequest('http://localhost/api/orders/7', {
        method: 'PATCH',
        body: JSON.stringify({}),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '7' }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: { fieldErrors: { phoneNumber1: ['required'] } } });
  });

  it('patches an order and records confirmation history', async () => {
    hasDbMock.mockReturnValue(true);
    vi.spyOn(orderPatchSchema, 'safeParse').mockReturnValue({
      success: true,
      data: {
        confirmed: 2,
        noAnswerCount: 0,
        note: 'Handle with care',
      },
    } as never);

    const existingOrder = {
      id: 7,
      firstName: 'Grace',
      lastName: 'Hopper',
      phoneNumber1: '0550111111',
      phoneNumber2: null,
      cartProducts: ['8'],
      delivery: 0,
      state: 31,
      city: 'Bir El Djir',
      homeAddress: 'Street 5',
      delPr: '150.00',
      price: '1200.00',
      note: null,
      confirmed: 0,
      noAnswerCount: 0,
      confirmedBy: null,
      confirmedByName: null,
      confirmedAt: null,
      createdAt: new Date('2026-03-01T10:00:00.000Z'),
      updatedAt: new Date('2026-03-01T10:00:00.000Z'),
    };

    const db = {
      query: {
        orders: {
          findFirst: vi.fn().mockResolvedValue(existingOrder),
        },
      },
      select: vi.fn().mockReturnValue({
        from: vi.fn()
          .mockReturnValueOnce({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([
                {
                  id: 3,
                  orderId: 7,
                  status: 2,
                  noAnswerCount: 0,
                  changedBy: 'admin@example.com',
                  changedByName: 'Admin',
                  changedAt: new Date('2026-03-02T11:00:00.000Z'),
                },
              ]),
            }),
          })
          .mockReturnValueOnce({
            where: vi.fn().mockResolvedValue([
              {
                id: 8,
                mongoId: null,
                title: 'Keyboard',
                price: 800,
                images: ['https://cdn.example.com/keyboard.jpg'],
              },
            ]),
          }),
      }),
    };
    getDbMock.mockReturnValue(db);
    mutateEntityWithHistoryMock.mockImplementation(async (_db, params) => {
      const updateRows = [
        {
          ...existingOrder,
          note: 'Handle with care',
          confirmed: 2,
          noAnswerCount: 0,
          confirmedBy: 'admin@example.com',
          confirmedByName: 'Admin',
          confirmedAt: new Date('2026-03-02T11:00:00.000Z'),
          updatedAt: new Date('2026-03-02T11:00:00.000Z'),
        },
      ];

      return params.execute({
        update: () => ({
          set: () => ({
            where: () => ({
              returning: () => Promise.resolve(updateRows),
            }),
          }),
        }),
        insert: () => ({
          values: () => Promise.resolve(undefined),
        }),
      });
    });

    const response = await PATCH(
      new NextRequest('http://localhost/api/orders/7', {
        method: 'PATCH',
        body: JSON.stringify({ confirmed: 2, noAnswerCount: 0, note: 'Handle with care' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '7' }) },
    );

    expect(requireMutationAccessMock).toHaveBeenCalledWith('orders');
    expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        entityType: 'orders',
        entityId: 7,
        operation: 'update',
        actor: { email: 'admin@example.com', name: 'Admin' },
      }),
    );
    expect(ensureOrderConfirmedEventForOrderMock).toHaveBeenCalledWith(db, expect.objectContaining({
      orderId: 7,
      statusHistoryId: 3,
      status: 2,
      changedAt: new Date('2026-03-02T11:00:00.000Z'),
    }));
    expect(ensureMarketingOrderStatusEventsMock).toHaveBeenCalledWith(db, expect.objectContaining({
      orderId: 7,
      statusHistoryId: 3,
      status: 2,
    }));
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        item: expect.objectContaining({
          id: 7,
          confirmed: 2,
          noAnswerCount: 0,
          note: 'Handle with care',
          subtotalOverride: 1200,
          productSubtotal: 1200,
          totalAmount: 1350,
          orderProducts: [
            {
              productId: 8,
              brandId: null,
              rawValue: '8',
              title: 'Keyboard',
              unitPrice: 800,
              quantity: 1,
              lineTotal: 800,
              thumbnailUrl: 'https://cdn.example.com/keyboard.jpg',
              missing: false,
            },
          ],
          hasStatusHistory: true,
        }),
      }),
    );
  });

  it('queues OrderCompleted after a completed status update', async () => {
    hasDbMock.mockReturnValue(true);
    vi.spyOn(orderPatchSchema, 'safeParse').mockReturnValue({
      success: true,
      data: { confirmed: 4, noAnswerCount: 0 },
    } as never);
    const existingOrder = {
      id: 7,
      firstName: 'Grace',
      lastName: 'Hopper',
      phoneNumber1: '0550111111',
      phoneNumber2: null,
      cartProducts: ['8'],
      delivery: 0,
      state: 31,
      city: 'Bir El Djir',
      homeAddress: 'Street 5',
      delPr: '150.00',
      price: '1200.00',
      note: null,
      confirmed: 2,
      noAnswerCount: 0,
      confirmedBy: 'admin@example.com',
      confirmedByName: 'Admin',
      confirmedAt: new Date('2026-03-02T11:00:00.000Z'),
      createdAt: new Date('2026-03-01T10:00:00.000Z'),
      updatedAt: new Date('2026-03-02T11:00:00.000Z'),
    };
    const db = {
      query: { orders: { findFirst: vi.fn().mockResolvedValue(existingOrder) } },
      select: vi.fn().mockReturnValue({
        from: vi.fn()
          .mockReturnValueOnce({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([{
                id: 40,
                orderId: 7,
                status: 10,
                noAnswerCount: 0,
                changedBy: 'admin@example.com',
                changedByName: 'Admin',
                changedAt: new Date('2026-03-02T12:00:00.000Z'),
              }, {
                id: 44,
                orderId: 7,
                status: 4,
                noAnswerCount: 0,
                changedBy: 'admin@example.com',
                changedByName: 'Admin',
                changedAt: new Date('2026-03-03T11:00:00.000Z'),
              }]),
            }),
          })
          .mockReturnValueOnce({
            where: vi.fn().mockResolvedValue([{
              id: 8,
              mongoId: null,
              title: 'Keyboard',
              price: 800,
              images: ['https://cdn.example.com/keyboard.jpg'],
            }]),
          }),
      }),
    };
    getDbMock.mockReturnValue(db);
    mutateEntityWithHistoryMock.mockImplementation(async (_db, params) => params.execute({
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: () => ({
            returning: () => Promise.resolve([{ ...existingOrder, ...values, confirmed: 4 }]),
          }),
        }),
      }),
      insert: () => ({
        values: () => Promise.resolve(undefined),
      }),
    }));

    const response = await PATCH(
      new NextRequest('http://localhost/api/orders/7', {
        method: 'PATCH',
        body: JSON.stringify({ confirmed: 4, noAnswerCount: 0 }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '7' }) },
    );

    expect(response.status).toBe(200);
    expect(ensureOrderCompletedEventForOrderMock).toHaveBeenCalledWith(db, expect.objectContaining({
      orderId: 7,
      statusHistoryId: 40,
      status: 10,
      changedAt: new Date('2026-03-02T12:00:00.000Z'),
    }));
    expect(ensureMarketingOrderStatusEventsMock).toHaveBeenCalledWith(db, expect.objectContaining({
      orderId: 7,
      statusHistoryId: 40,
      status: 10,
    }));
  });

  it('keeps the admin update successful when OrderCompleted enqueue fails', async () => {
    ensureOrderCompletedEventForOrderMock.mockRejectedValue(new Error('Meta unavailable'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    hasDbMock.mockReturnValue(true);
    vi.spyOn(orderPatchSchema, 'safeParse').mockReturnValue({
      success: true,
      data: { confirmed: 10, noAnswerCount: 0 },
    } as never);
    const existingOrder = {
      id: 7,
      firstName: 'Grace',
      lastName: 'Hopper',
      phoneNumber1: '0550111111',
      phoneNumber2: null,
      cartProducts: ['8'],
      delivery: 0,
      state: 31,
      city: 'Bir El Djir',
      homeAddress: 'Street 5',
      delPr: '150.00',
      price: '1200.00',
      note: null,
      confirmed: 2,
      noAnswerCount: 0,
      confirmedBy: 'admin@example.com',
      confirmedByName: 'Admin',
      confirmedAt: new Date('2026-03-02T11:00:00.000Z'),
      createdAt: new Date('2026-03-01T10:00:00.000Z'),
      updatedAt: new Date('2026-03-02T11:00:00.000Z'),
    };
    const db = {
      query: { orders: { findFirst: vi.fn().mockResolvedValue(existingOrder) } },
      select: vi.fn().mockReturnValue({
        from: vi.fn()
          .mockReturnValueOnce({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([{
                id: 45,
                orderId: 7,
                status: 10,
                noAnswerCount: 0,
                changedBy: 'admin@example.com',
                changedByName: 'Admin',
                changedAt: new Date('2026-03-03T11:00:00.000Z'),
              }]),
            }),
          })
          .mockReturnValueOnce({ where: vi.fn().mockResolvedValue([]) }),
      }),
    };
    getDbMock.mockReturnValue(db);
    mutateEntityWithHistoryMock.mockImplementation(async (_db, params) => params.execute({
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: () => ({
            returning: () => Promise.resolve([{ ...existingOrder, ...values, confirmed: 10 }]),
          }),
        }),
      }),
      insert: () => ({
        values: () => Promise.resolve(undefined),
      }),
    }));

    const response = await PATCH(
      new NextRequest('http://localhost/api/orders/7', {
        method: 'PATCH',
        body: JSON.stringify({ confirmed: 10, noAnswerCount: 0 }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '7' }) },
    );

    expect(response.status).toBe(200);
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to queue Meta OrderCompleted event',
      expect.objectContaining({ orderId: 7, message: 'Meta unavailable' }),
    );
    consoleError.mockRestore();
  });

  it('patches first and last name fields', async () => {
    hasDbMock.mockReturnValue(true);
    vi.spyOn(orderPatchSchema, 'safeParse').mockReturnValue({
      success: true,
      data: {
        firstName: 'Grace',
        lastName: 'Murray Hopper',
      },
    } as never);

    const existingOrder = {
      id: 7,
      firstName: 'Grace',
      lastName: 'Hopper',
      phoneNumber1: '0550111111',
      phoneNumber2: null,
      cartProducts: ['8'],
      delivery: 0,
      state: 31,
      city: 'Bir El Djir',
      homeAddress: 'Street 5',
      delPr: '150.00',
      price: '1200.00',
      note: null,
      confirmed: 0,
      noAnswerCount: 0,
      confirmedBy: null,
      confirmedByName: null,
      confirmedAt: null,
      createdAt: new Date('2026-03-01T10:00:00.000Z'),
      updatedAt: new Date('2026-03-01T10:00:00.000Z'),
    };

    const db = {
      query: {
        orders: {
          findFirst: vi.fn().mockResolvedValue(existingOrder),
        },
      },
      select: vi.fn().mockReturnValue({
        from: vi.fn()
          .mockReturnValueOnce({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          })
          .mockReturnValueOnce({
            where: vi.fn().mockResolvedValue([]),
          }),
      }),
    };
    getDbMock.mockReturnValue(db);
    mutateEntityWithHistoryMock.mockImplementation(async (_db, params) => {
      const updateRows = [
        {
          ...existingOrder,
          firstName: 'Grace',
          lastName: 'Murray Hopper',
          updatedAt: new Date('2026-03-02T11:00:00.000Z'),
        },
      ];

      return params.execute({
        update: () => ({
          set: (values: Record<string, unknown>) => {
            expect(values.firstName).toBe('Grace');
            expect(values.lastName).toBe('Murray Hopper');

            return {
              where: () => ({
                returning: () => Promise.resolve(updateRows),
              }),
            };
          },
        }),
        insert: () => ({
          values: () => Promise.resolve(undefined),
        }),
      });
    });

    const response = await PATCH(
      new NextRequest('http://localhost/api/orders/7', {
        method: 'PATCH',
        body: JSON.stringify({ firstName: 'Grace', lastName: 'Murray Hopper' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '7' }) },
    );

    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        item: expect.objectContaining({
          firstName: 'Grace',
          lastName: 'Murray Hopper',
          fullName: 'Grace Murray Hopper',
        }),
      }),
    );
  });

  it('clears the degraded capture variant once an order becomes complete', async () => {
    hasDbMock.mockReturnValue(true);
    vi.spyOn(orderPatchSchema, 'safeParse').mockReturnValue({
      success: true,
      data: {
        state: 31,
        city: 'Bir El Djir',
        homeAddress: 'Street 5',
        cartProducts: ['8'],
      },
    } as never);

    const existingOrder = {
      id: 8,
      firstName: null,
      lastName: null,
      phoneNumber1: '0550222222',
      phoneNumber2: null,
      cartProducts: [],
      delivery: 0,
      state: null,
      city: null,
      homeAddress: null,
      delPr: null,
      price: null,
      note: null,
      confirmed: 0,
      noAnswerCount: 0,
      confirmedBy: null,
      confirmedByName: null,
      confirmedAt: null,
      publicToken: 'public-token',
      variant: 'degraded_capture',
      createdAt: new Date('2026-03-01T10:00:00.000Z'),
      updatedAt: new Date('2026-03-01T10:00:00.000Z'),
    };

    const db = {
      query: {
        orders: {
          findFirst: vi.fn().mockResolvedValue(existingOrder),
        },
      },
      select: vi.fn().mockReturnValue({
        from: vi.fn()
          .mockReturnValueOnce({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          })
          .mockReturnValueOnce({
            where: vi.fn().mockResolvedValue([
              {
                id: 8,
                mongoId: null,
                title: 'Keyboard',
                price: 800,
                images: ['https://cdn.example.com/keyboard.jpg'],
              },
            ]),
          }),
      }),
    };
    getDbMock.mockReturnValue(db);
    mutateEntityWithHistoryMock.mockImplementation(async (_db, params) => {
      const updateRows = [
        {
          ...existingOrder,
          cartProducts: ['8'],
          state: 31,
          city: 'Bir El Djir',
          homeAddress: 'Street 5',
          delPr: '400.00',
          variant: null,
          updatedAt: new Date('2026-03-02T11:00:00.000Z'),
        },
      ];

      return params.execute({
        update: () => ({
          set: (values: Record<string, unknown>) => {
            expect(values.variant).toBeNull();
            return {
              where: () => ({
                returning: () => Promise.resolve(updateRows),
              }),
            };
          },
        }),
        insert: () => ({
          values: () => Promise.resolve(undefined),
        }),
      });
    });

    const response = await PATCH(
      new NextRequest('http://localhost/api/orders/8', {
        method: 'PATCH',
        body: JSON.stringify({ state: 31, city: 'Bir El Djir', homeAddress: 'Street 5', cartProducts: ['8'] }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '8' }) },
    );

    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        item: expect.objectContaining({
          id: 8,
          variant: null,
          isDegradedCapture: false,
        }),
      }),
    );
  });

  it('recalculates delivery fee when delivery details change', async () => {
    hasDbMock.mockReturnValue(true);
    vi.spyOn(orderPatchSchema, 'safeParse').mockReturnValue({
      success: true,
      data: {
        delivery: 1,
        state: 31,
        city: '77',
      },
    } as never);

    const existingOrder = {
      id: 9,
      firstName: 'Nina',
      lastName: 'Simone',
      phoneNumber1: '0550999999',
      phoneNumber2: null,
      cartProducts: [],
      delivery: 0,
      state: 16,
      city: '42',
      homeAddress: 'Street 9',
      delPr: '200.00',
      price: '0.00',
      note: null,
      confirmed: 0,
      noAnswerCount: 0,
      confirmedBy: null,
      confirmedByName: null,
      confirmedAt: null,
      createdAt: new Date('2026-03-01T10:00:00.000Z'),
      updatedAt: new Date('2026-03-01T10:00:00.000Z'),
    };

    const db = {
      query: {
        orders: {
          findFirst: vi.fn().mockResolvedValue(existingOrder),
        },
      },
      select: vi.fn().mockReturnValue({
        from: vi.fn()
          .mockReturnValueOnce({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          })
          .mockReturnValueOnce({
            where: vi.fn().mockResolvedValue([]),
          }),
      }),
    };
    getDbMock.mockReturnValue(db);

    let capturedUpdate: Record<string, unknown> | null = null;
    mutateEntityWithHistoryMock.mockImplementation(async (_db, params) => {
      const rows = await params.execute({
        update: () => ({
          set: (value: Record<string, unknown>) => {
            capturedUpdate = value;
            return {
              where: () => ({
                returning: () => Promise.resolve([{
                  ...existingOrder,
                  ...value,
                  delivery: 1,
                  state: 31,
                  city: '77',
                  delPr: '350.00',
                }]),
              }),
            };
          },
        }),
        insert: () => ({
          values: () => Promise.resolve(undefined),
        }),
      });

      return rows;
    });

    const response = await PATCH(
      new NextRequest('http://localhost/api/orders/9', {
        method: 'PATCH',
        body: JSON.stringify({ delivery: 1, state: 31, city: '77' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '9' }) },
    );

    expect(readEcotrackCatalogMock).toHaveBeenCalledWith(db);
    expect(capturedUpdate).toEqual(expect.objectContaining({
      delivery: 1,
      state: 31,
      city: '77',
      delPr: '350.00',
    }));
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      ok: true,
      item: expect.objectContaining({
        delivery: 1,
        state: 31,
        city: '77',
        deliveryFee: 350,
      }),
    }));
  });

  it('deletes an order when RBAC allows it', async () => {
    hasDbMock.mockReturnValue(true);
    const db = { marker: 'db' };
    getDbMock.mockReturnValue(db);
    mutateEntityWithHistoryMock.mockResolvedValue(undefined);

    const response = await DELETE(new NextRequest('http://localhost/api/orders/7', { method: 'DELETE' }), {
      params: Promise.resolve({ id: '7' }),
    });

    expect(requireMutationAccessMock).toHaveBeenCalledWith('orders');
    expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        entityType: 'orders',
        entityId: 7,
        operation: 'delete',
        actor: { email: 'admin@example.com', name: 'Admin' },
      }),
    );
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
