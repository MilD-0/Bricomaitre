import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE } from './route';

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

vi.mock('@/lib/auth', () => ({
  auth: authMock,
}));

vi.mock('@/lib/action-history', () => ({
  mutateEntityWithHistory: mutateEntityWithHistoryMock,
}));

describe('app/api/bulletin/replies/[replyId]/route', () => {
  beforeEach(() => {
    hasDbMock.mockReturnValue(true);
    authMock.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        name: 'User',
        isAllowed: true,
        permissions: [],
      },
    });
    mutateEntityWithHistoryMock.mockReset();
    mutateEntityWithHistoryMock.mockResolvedValue(undefined);
    getDbMock.mockReturnValue({
      query: {
        bulletinReplies: {
          findFirst: vi.fn().mockResolvedValue({
            id: 9,
            authorId: 'user-1',
          }),
        },
      },
    });
  });

  it('deletes an owned reply', async () => {
    const res = await DELETE(
      new NextRequest('http://localhost/api/bulletin/replies/9', { method: 'DELETE' }),
      {
        params: Promise.resolve({ replyId: '9' }),
      },
    );

    expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: 'bulletinReplies',
        operation: 'delete',
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('returns 400 before querying for a malformed reply id', async () => {
    const res = await DELETE(
      new NextRequest('http://localhost/api/bulletin/replies/nope', { method: 'DELETE' }),
      { params: Promise.resolve({ replyId: 'nope' }) },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid bulletin reply id' });
  });
});
