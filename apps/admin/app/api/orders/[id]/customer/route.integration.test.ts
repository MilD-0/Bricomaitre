import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDbMock, hasDbMock, requireMutationAccessMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  hasDbMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ getDb: getDbMock, hasDb: hasDbMock }));
vi.mock('@/lib/rbac', () => ({ requireMutationAccess: requireMutationAccessMock }));

import { GET } from './route';

describe('/api/orders/[id]/customer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasDbMock.mockReturnValue(true);
    requireMutationAccessMock.mockImplementation(async () => ({
      response: null,
      session: { user: { isAllowed: true, permissions: [] } },
    }));
  });

  it('enforces order access before reading customer history', async () => {
    requireMutationAccessMock.mockImplementation(async () => ({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      session: null,
    }));

    const response = await GET(new Request('http://localhost/api/orders/7/customer'), {
      params: Promise.resolve({ id: '7' }),
    });

    expect(response.status).toBe(403);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it('returns controlled failures for unavailable storage and malformed ids', async () => {
    hasDbMock.mockReturnValueOnce(false);
    const unavailable = await GET(new Request('http://localhost/api/orders/7/customer'), {
      params: Promise.resolve({ id: '7' }),
    });
    expect(unavailable.status).toBe(503);

    const malformed = await GET(new Request('http://localhost/api/orders/nope/customer'), {
      params: Promise.resolve({ id: 'nope' }),
    });
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({ error: 'Invalid order id' });
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it('returns not found without attempting an aggregate query', async () => {
    const select = vi.fn();
    getDbMock.mockReturnValue({
      query: { orders: { findFirst: vi.fn().mockResolvedValue(undefined) } },
      select,
    });

    const response = await GET(new Request('http://localhost/api/orders/404/customer'), {
      params: Promise.resolve({ id: '404' }),
    });

    expect(response.status).toBe(404);
    expect(select).not.toHaveBeenCalled();
  });

  it('returns the completed history count for the selected order customer', async () => {
    const where = vi.fn().mockResolvedValue([{ completedOrderCount: 3 }]);
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    getDbMock.mockReturnValue({
      query: {
        orders: {
          findFirst: vi.fn().mockResolvedValue({
            id: 7,
            normalizedPhone: '0555000000',
            phoneNumber1: '0555000000',
            createdAt: new Date('2026-08-20T10:00:00Z'),
          }),
        },
      },
      select,
    });

    const response = await GET(new Request('http://localhost/api/orders/7/customer'), {
      params: Promise.resolve({ id: '7' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ completedOrderCount: 3 });
    expect(select).toHaveBeenCalledOnce();
    expect(where).toHaveBeenCalledOnce();
  });
});
