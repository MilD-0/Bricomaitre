import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as postReaction } from './[id]/reactions/route';
import { POST as replyReaction } from './replies/[replyId]/reactions/route';
import {
  BulletinPostNotFoundError,
  BulletinReplyNotFoundError,
} from '../../../lib/bulletin-mutations';

const { authMock, mutation, getDbMock, hasDbMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  mutation: vi.fn(),
  getDbMock: vi.fn(),
  hasDbMock: vi.fn(),
}));
vi.mock('../../../lib/auth', () => ({ auth: authMock }));
vi.mock('@bric/db/client', () => ({ getDb: getDbMock, hasDb: hasDbMock }));
vi.mock('../../../lib/bulletin-mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/bulletin-mutations')>()),
  setBulletinPostReaction: mutation,
  setBulletinReplyReaction: mutation,
}));

const user = {
  id: 'user',
  email: 'user@example.test',
  name: 'User',
  isAllowed: true,
  permissions: [],
};
describe.each([
  {
    target: 'post',
    call: (req: NextRequest, id: string) => postReaction(req, { params: Promise.resolve({ id }) }),
    missing: () => new BulletinPostNotFoundError(5),
  },
  {
    target: 'reply',
    call: (req: NextRequest, replyId: string) =>
      replyReaction(req, { params: Promise.resolve({ replyId }) }),
    missing: () => new BulletinReplyNotFoundError(5),
  },
])('$target reaction transport', ({ call, missing }) => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user });
    mutation.mockReset().mockResolvedValue({ reacted: true });
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ database: true });
  });
  const request = (body: unknown) =>
    new NextRequest('http://localhost/api/bulletin/reaction', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });
  it('validates the emoji and forwards the authenticated actor and toggle intent', async () => {
    const response = await call(request({ emoji: ' 👍 ' }), '5');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, reacted: true });
    expect(mutation).toHaveBeenCalledExactlyOnceWith({ database: true }, 5, '👍', 'toggle', {
      id: user.id,
      email: user.email,
      name: user.name,
    });
  });
  it('rejects unauthenticated and disallowed sessions before reading storage', async () => {
    for (const [session, status] of [
      [null, 401],
      [{ user: { ...user, isAllowed: false } }, 403],
    ] as const) {
      authMock.mockResolvedValue(session);
      expect((await call(request({ emoji: '👍' }), '5')).status).toBe(status);
    }
    expect(getDbMock).not.toHaveBeenCalled();
    expect(mutation).not.toHaveBeenCalled();
  });
  it('rejects invalid identifiers and malformed payloads before mutation', async () => {
    expect((await call(request({ emoji: '👍' }), 'nope')).status).toBe(400);
    expect((await call(request({ emoji: '' }), '5')).status).toBe(400);
    expect(mutation).not.toHaveBeenCalled();
  });
  it('maps a missing target to 404', async () => {
    mutation.mockRejectedValue(missing());
    expect((await call(request({ emoji: '👍' }), '5')).status).toBe(404);
  });
});
