import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createPost: vi.fn(),
  createReply: vi.fn(),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
  deleteReply: vi.fn(),
  setPostReaction: vi.fn(),
  setReplyReaction: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ getDb: () => 'database' }));
vi.mock('./bulletin-mutations', () => ({
  createBulletinPost: mocks.createPost,
  createBulletinReply: mocks.createReply,
  updateBulletinPost: mocks.updatePost,
  deleteBulletinPost: mocks.deletePost,
  deleteBulletinReply: mocks.deleteReply,
  setBulletinPostReaction: mocks.setPostReaction,
  setBulletinReplyReaction: mocks.setReplyReaction,
}));

import {
  createAdminAiBulletinPost,
  deleteAdminAiBulletinContent,
  replyToAdminAiBulletinPost,
  setAdminAiBulletinReaction,
  updateAdminAiBulletinPost,
} from './admin-ai-bulletin';

const actor = {
  id: 'user-1',
  email: 'admin@example.com',
  name: 'Admin',
  permissions: ['bulletin_moderate'] as const,
};

describe('admin AI Bulletin writes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a canonical text post without inventing attachment records', async () => {
    mocks.createPost.mockResolvedValue({ id: 12, pinned: true });
    await expect(
      createAdminAiBulletinPost(
        {
          title: 'Launch follow-up',
          body: 'Please confirm the remaining storefront launch checks today.',
          tags: ['Launch', 'ops'],
          pinned: true,
        },
        actor,
      ),
    ).resolves.toEqual({
      ok: true,
      id: 12,
      pinned: true,
      title: 'Launch follow-up',
      tags: ['Launch', 'ops'],
    });
    expect(mocks.createPost).toHaveBeenCalledWith(
      'database',
      expect.objectContaining({ attachments: [] }),
      actor,
    );
  });

  it('replies to the exact inspected thread as the current actor', async () => {
    mocks.createReply.mockResolvedValue({ postId: 7 });
    await expect(
      replyToAdminAiBulletinPost(
        { postId: 7, body: 'I will finish the remaining checks this afternoon.' },
        actor,
      ),
    ).resolves.toEqual({ ok: true, postId: 7 });
    expect(mocks.createReply).toHaveBeenCalledWith(
      'database',
      7,
      { body: 'I will finish the remaining checks this afternoon.' },
      actor,
    );
  });

  it('updates only explicitly supplied fields on the exact inspected post', async () => {
    mocks.updatePost.mockResolvedValue({
      id: 7,
      updatedFields: ['title', 'pinned'],
      pinned: true,
    });
    await expect(
      updateAdminAiBulletinPost({ postId: 7, title: 'Updated launch', pinned: true }, actor),
    ).resolves.toEqual({
      ok: true,
      id: 7,
      updatedFields: ['title', 'pinned'],
      pinned: true,
    });
    expect(mocks.updatePost).toHaveBeenCalledWith(
      'database',
      7,
      { title: 'Updated launch', pinned: true },
      actor,
    );
  });

  it('deletes one exact post or reply through the canonical permission-aware workflow', async () => {
    mocks.deletePost.mockResolvedValue({ id: 7, deleted: true });
    mocks.deleteReply.mockResolvedValue({ id: 9, postId: 7, deleted: true });

    await expect(deleteAdminAiBulletinContent({ kind: 'post', postId: 7 }, actor)).resolves.toEqual(
      { ok: true, kind: 'post', id: 7, deleted: true },
    );
    await expect(
      deleteAdminAiBulletinContent({ kind: 'reply', replyId: 9 }, actor),
    ).resolves.toEqual({ ok: true, kind: 'reply', id: 9, postId: 7, deleted: true });
    expect(mocks.deletePost).toHaveBeenCalledWith('database', 7, actor);
    expect(mocks.deleteReply).toHaveBeenCalledWith('database', 9, actor);
  });

  it('sets exact post and reply reaction states idempotently', async () => {
    mocks.setPostReaction.mockResolvedValue({
      id: 7,
      emoji: '👍',
      reacted: true,
      changed: true,
    });
    mocks.setReplyReaction.mockResolvedValue({
      id: 9,
      postId: 7,
      emoji: '🔥',
      reacted: false,
      changed: false,
    });

    await expect(
      setAdminAiBulletinReaction({ kind: 'post', postId: 7, emoji: '👍', action: 'add' }, actor),
    ).resolves.toEqual({
      ok: true,
      kind: 'post',
      requestedAction: 'add',
      id: 7,
      emoji: '👍',
      reacted: true,
      changed: true,
    });
    await expect(
      setAdminAiBulletinReaction(
        { kind: 'reply', replyId: 9, emoji: '🔥', action: 'remove' },
        actor,
      ),
    ).resolves.toEqual({
      ok: true,
      kind: 'reply',
      requestedAction: 'remove',
      id: 9,
      postId: 7,
      emoji: '🔥',
      reacted: false,
      changed: false,
    });
  });
});
