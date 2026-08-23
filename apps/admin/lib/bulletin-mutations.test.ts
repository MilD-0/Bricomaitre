import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  syncTags: vi.fn(),
  syncAttachments: vi.fn(),
  updateSet: vi.fn(),
  deleteWhere: vi.fn(),
  post: vi.fn(),
  reply: vi.fn(),
}));

vi.mock('./action-history', () => ({ mutateEntityWithHistory: mocks.mutate }));
vi.mock('./bulletin-server', () => ({
  syncBulletinPostTags: mocks.syncTags,
  syncBulletinPostAttachments: mocks.syncAttachments,
}));

import {
  BulletinMutationForbiddenError,
  deleteBulletinPost,
  deleteBulletinReply,
  updateBulletinPost,
} from './bulletin-mutations';

const actor = {
  id: 'user-1',
  email: 'owner@example.com',
  name: 'Owner',
  permissions: [] as const,
};

function database() {
  const updateChain = { where: vi.fn().mockResolvedValue(undefined) };
  const deleteChain = { where: mocks.deleteWhere.mockResolvedValue(undefined) };
  const tx = {
    update: vi.fn(() => ({
      set: (values: unknown) => {
        mocks.updateSet(values);
        return updateChain;
      },
    })),
    delete: vi.fn(() => deleteChain),
  };
  const db = {
    query: {
      bulletinPosts: { findFirst: mocks.post },
      bulletinReplies: { findFirst: mocks.reply },
    },
  };
  mocks.mutate.mockImplementation(async (_db, input) => input.execute(tx));
  return { db, tx };
}

describe('canonical Bulletin mutations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates only supplied post fields while preserving attachments and recording history', async () => {
    const { db } = database();
    mocks.post.mockResolvedValue({ id: 7, authorId: 'user-1', pinned: false });

    await expect(
      updateBulletinPost(db as never, 7, { title: 'Updated launch', tags: ['Launch'] }, actor),
    ).resolves.toEqual({ id: 7, updatedFields: ['title', 'tags'], pinned: false });
    expect(mocks.updateSet).toHaveBeenCalledWith({
      title: 'Updated launch',
      updatedAt: expect.any(Date),
    });
    expect(mocks.syncTags).toHaveBeenCalledWith(expect.anything(), 7, ['launch']);
    expect(mocks.syncAttachments).not.toHaveBeenCalled();
    expect(mocks.mutate).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        entityType: 'bulletinPosts',
        entityId: 7,
        operation: 'update',
        actor,
      }),
    );
  });

  it('rejects edits by non-owners without moderation access before writing', async () => {
    const { db } = database();
    mocks.post.mockResolvedValue({ id: 7, authorId: 'another-user', pinned: false });

    await expect(
      updateBulletinPost(db as never, 7, { pinned: true }, actor),
    ).rejects.toBeInstanceOf(BulletinMutationForbiddenError);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it('lets moderators delete exact posts and replies with dependent cleanup and history', async () => {
    const { db, tx } = database();
    const moderator = { ...actor, permissions: ['bulletin_moderate'] as const };
    mocks.post.mockResolvedValue({ id: 7, authorId: 'another-user' });
    mocks.reply.mockResolvedValue({ id: 9, postId: 7, authorId: 'another-user' });

    await expect(deleteBulletinPost(db as never, 7, moderator)).resolves.toEqual({
      id: 7,
      deleted: true,
    });
    await expect(deleteBulletinReply(db as never, 9, moderator)).resolves.toEqual({
      id: 9,
      postId: 7,
      deleted: true,
    });
    expect(tx.delete).toHaveBeenCalledTimes(4);
    expect(mocks.mutate).toHaveBeenNthCalledWith(
      1,
      db,
      expect.objectContaining({ entityType: 'bulletinPosts', operation: 'delete', entityId: 7 }),
    );
    expect(mocks.mutate).toHaveBeenNthCalledWith(
      2,
      db,
      expect.objectContaining({ entityType: 'bulletinReplies', operation: 'delete', entityId: 9 }),
    );
  });
});
