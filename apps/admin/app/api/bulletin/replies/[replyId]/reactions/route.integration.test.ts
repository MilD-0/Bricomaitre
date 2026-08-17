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

vi.mock('../../../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../../../lib/action-history', () => ({
  mutateEntityWithHistory: mutateEntityWithHistoryMock,
}));

describe('app/api/bulletin/replies/[replyId]/reactions/route', () => {
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
          findFirst: vi.fn().mockResolvedValue({ id: 9 }),
        },
        bulletinReplyReactions: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    });
  });

  it('creates a reply reaction toggle entry', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/bulletin/replies/9/reactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emoji: '🔥' }),
      }),
      { params: Promise.resolve({ replyId: '9' }) },
    );

    expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: 'bulletinReplyReactions',
        operation: 'create',
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, reacted: true });
  });

  it('returns 400 before querying for a malformed reply id', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/bulletin/replies/nope/reactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emoji: '🔥' }),
      }),
      { params: Promise.resolve({ replyId: 'nope' }) },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid bulletin reply id' });
  });
});
