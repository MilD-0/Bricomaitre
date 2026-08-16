import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

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

vi.mock('../../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../../lib/action-history', () => ({
  mutateEntityWithHistory: mutateEntityWithHistoryMock,
}));

describe('app/api/bulletin/[id]/replies/route', () => {
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
        bulletinPosts: {
          findFirst: vi.fn().mockResolvedValue({ id: 5 }),
        },
      },
    });
  });

  it('creates a reply for a post', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/bulletin/5/replies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: 'I will take care of this.' }),
      }),
      { params: Promise.resolve({ id: '5' }) },
    );

    expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: 'bulletinReplies',
        operation: 'create',
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});
