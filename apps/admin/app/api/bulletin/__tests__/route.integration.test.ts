import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from '../route';
import { bulletinPostSchema } from '../../../../lib/bulletin';

const { hasDbMock, getDbMock, authMock, mutateEntityWithHistoryMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  authMock: vi.fn(),
  mutateEntityWithHistoryMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../lib/action-history', () => ({
  mutateEntityWithHistory: mutateEntityWithHistoryMock,
}));

describe('app/api/bulletin/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    authMock.mockReset();
    mutateEntityWithHistoryMock.mockReset();
    mutateEntityWithHistoryMock.mockResolvedValue([{ id: 1 }]);
  });

  it('returns 401 when no session is present', async () => {
    authMock.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('creates a bulletin post and strips pinned for non-moderators', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ marker: 'db' });
    authMock.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        name: 'User',
        isAllowed: true,
        permissions: [],
      },
    });

    vi.spyOn(bulletinPostSchema, 'safeParse').mockReturnValue({
      success: true,
      data: {
        title: 'Store reminder',
        body: 'Close the side door before the shift ends tonight.',
        tags: ['ops'],
        pinned: true,
        attachments: [],
      },
    } as never);

    const req = new NextRequest('http://localhost/api/bulletin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await POST(req);

    expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(
      { marker: 'db' },
      expect.objectContaining({
        entityType: 'bulletinPosts',
        operation: 'create',
      }),
    );

    const { execute } = mutateEntityWithHistoryMock.mock.calls[0][1];
    const returningMock = vi.fn().mockResolvedValue([{ id: 9 }]);
    const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
    const insertMock = vi
      .fn()
      .mockReturnValueOnce({ values: valuesMock })
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi
            .fn()
            .mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
        }),
      })
      .mockReturnValueOnce({ values: vi.fn().mockResolvedValue(undefined) });

    await execute({
      insert: insertMock,
      delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
      }),
    });

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pinned: false,
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});
