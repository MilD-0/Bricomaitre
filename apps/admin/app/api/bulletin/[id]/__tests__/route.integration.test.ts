import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, PATCH } from '../route';
import { bulletinPostPatchSchema } from '../../../../../lib/bulletin';

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

describe('app/api/bulletin/[id]/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    authMock.mockReset();
    mutateEntityWithHistoryMock.mockReset();
    hasDbMock.mockReturnValue(true);
  });

  it('forbids deleting another user post without bulletin moderation access', async () => {
    authMock.mockResolvedValue({
      user: {
        id: 'user-2',
        email: 'other@example.com',
        name: 'Other',
        isAllowed: true,
        permissions: [],
      },
    });
    getDbMock.mockReturnValue({
      query: {
        bulletinPosts: {
          findFirst: vi.fn().mockResolvedValue({
            id: 5,
            authorId: 'user-1',
            authorName: 'Owner',
            authorEmail: 'owner@example.com',
            title: 'Reminder',
            body: 'Body',
            pinned: false,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          }),
        },
      },
    });

    const res = await DELETE(
      new NextRequest('http://localhost/api/bulletin/5', { method: 'DELETE' }),
      {
        params: Promise.resolve({ id: '5' }),
      },
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('allows moderators to patch pinned state', async () => {
    authMock.mockResolvedValue({
      user: {
        id: 'user-2',
        email: 'moderator@example.com',
        name: 'Moderator',
        isAllowed: true,
        permissions: ['bulletin_moderate'],
      },
    });
    getDbMock.mockReturnValue({
      query: {
        bulletinPosts: {
          findFirst: vi.fn().mockResolvedValue({
            id: 5,
            authorId: 'user-1',
            authorName: 'Owner',
            authorEmail: 'owner@example.com',
            title: 'Reminder',
            body: 'Body',
            pinned: false,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          }),
        },
      },
    });
    vi.spyOn(bulletinPostPatchSchema, 'safeParse').mockReturnValue({
      success: true,
      data: { pinned: true },
    } as never);

    const res = await PATCH(
      new NextRequest('http://localhost/api/bulletin/5', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pinned: true }),
      }),
      { params: Promise.resolve({ id: '5' }) },
    );

    expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: 'bulletinPosts',
        operation: 'update',
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});
