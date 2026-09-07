import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, PATCH } from '../route';

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

describe('app/api/bulletin/[id]/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    authMock.mockReset();
    mutateEntityWithHistoryMock.mockReset();
    hasDbMock.mockReturnValue(true);
  });

  it.each([
    [
      'PATCH',
      (request: NextRequest) => PATCH(request, { params: Promise.resolve({ id: 'nope' }) }),
    ],
    [
      'DELETE',
      (request: NextRequest) => DELETE(request, { params: Promise.resolve({ id: 'nope' }) }),
    ],
  ])('returns 400 before querying for a malformed post id in %s', async (method, callRoute) => {
    authMock.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        name: 'User',
        isAllowed: true,
        permissions: [],
      },
    });
    const request = new NextRequest('http://localhost/api/bulletin/nope', {
      method,
      ...(method === 'PATCH'
        ? {
            body: JSON.stringify({ title: 'Valid title' }),
            headers: { 'content-type': 'application/json' },
          }
        : {}),
    });

    const res = await callRoute(request);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid bulletin post id' });
    expect(getDbMock).not.toHaveBeenCalled();
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
