import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, expect, it, vi } from 'vitest';
import { getDb, getPool } from '@bric/db/client';
import {
  actionLogs,
  bulletinPostAttachments,
  bulletinPosts,
  bulletinPostTags,
  bulletinReplies,
  bulletinTags,
  users,
} from '@bric/db/schema';
import {
  BulletinMutationForbiddenError,
  createBulletinPost,
  createBulletinReply,
  deleteBulletinPost,
  setBulletinPostReaction,
  setBulletinReplyReaction,
  updateBulletinPost,
} from '../lib/bulletin-mutations';
import { loadBulletinData } from '../lib/bulletin-server';

vi.mock('../lib/auth', () => ({ auth: vi.fn() }));
afterAll(() => getPool().end());

it('preserves distinct Arabic and punctuation tags, owner permissions and aggregate mutations', async () => {
  const db = getDb();
  const id = randomUUID();
  const actor = { id, email: `${id}@example.test`, name: 'Operator', permissions: [] };
  const tags = ['صيانة', 'توصيل', 'équipe!', 'équipe?'].map((tag) => `${tag}-${id.slice(0, 6)}`);
  await db.insert(users).values({ id, email: actor.email, name: actor.name });
  let postId: number | undefined;
  try {
    const created = await createBulletinPost(
      db,
      {
        title: 'Warehouse handoff',
        body: 'The delivery documents are ready.',
        tags,
        attachments: [
          {
            fileName: 'brief.pdf',
            fileUrl: '/api/bulletin/attachments/bulletin/brief.pdf',
            fileKey: 'bulletin/brief.pdf',
            contentType: 'application/pdf',
            size: 12,
          },
        ],
      },
      actor,
    );
    postId = created.id;
    const storedTags = await db
      .select({ name: bulletinTags.name })
      .from(bulletinPostTags)
      .innerJoin(bulletinTags, eq(bulletinTags.id, bulletinPostTags.tagId))
      .where(eq(bulletinPostTags.postId, postId));
    expect(storedTags.map(({ name }) => name).sort()).toEqual([...tags].sort());
    const page = await loadBulletinData({ userId: id, permissions: [] }, { tag: tags[1] });
    expect(page.posts.map((post) => post.id)).toContain(postId);
    expect(page.posts.find((post) => post.id === postId)?.permissions).toEqual({
      canEdit: true,
      canDelete: true,
      canPin: true,
    });

    await expect(
      updateBulletinPost(
        db,
        postId,
        { title: 'Foreign edit' },
        {
          ...actor,
          id: 'foreign',
          email: 'foreign@example.test',
        },
      ),
    ).rejects.toBeInstanceOf(BulletinMutationForbiddenError);
    await updateBulletinPost(db, postId, { title: 'Updated handoff', attachments: [] }, actor);
    expect(
      await db.query.bulletinPosts.findFirst({ where: eq(bulletinPosts.id, postId) }),
    ).toMatchObject({ title: 'Updated handoff', body: 'The delivery documents are ready.' });
    expect(
      await db
        .select()
        .from(bulletinPostAttachments)
        .where(eq(bulletinPostAttachments.postId, postId)),
    ).toHaveLength(0);
    await createBulletinReply(db, postId, { body: 'Received.' }, actor);
    const reply = await db.query.bulletinReplies.findFirst({
      where: eq(bulletinReplies.postId, postId),
    });
    const additions = await Promise.all(
      Array.from({ length: 6 }, () => setBulletinPostReaction(db, postId!, '👍', 'add', actor)),
    );
    expect(additions.every((result) => result.reacted)).toBe(true);
    expect(additions.filter((result) => result.changed)).toHaveLength(1);
    expect(await setBulletinPostReaction(db, postId, '👍', 'add', actor)).toMatchObject({
      reacted: true,
      changed: false,
    });
    expect(await setBulletinReplyReaction(db, reply!.id, '👍', 'add', actor)).toMatchObject({
      reacted: true,
    });
    const removals = await Promise.all(
      Array.from({ length: 6 }, () =>
        setBulletinReplyReaction(db, reply!.id, '👍', 'remove', actor),
      ),
    );
    expect(removals.every((result) => !result.reacted)).toBe(true);
    expect(removals.filter((result) => result.changed)).toHaveLength(1);
    await deleteBulletinPost(db, postId, actor);
    expect(
      await db.select().from(bulletinReplies).where(eq(bulletinReplies.postId, postId)),
    ).toHaveLength(0);
    expect(
      await db.select().from(bulletinPostTags).where(eq(bulletinPostTags.postId, postId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(actionLogs)
        .where(and(eq(actionLogs.createdBy, actor.email), eq(actionLogs.operation, 'delete'))),
    ).not.toHaveLength(0);
  } finally {
    if (postId) await db.delete(bulletinPosts).where(eq(bulletinPosts.id, postId));
    await db.delete(actionLogs).where(eq(actionLogs.createdBy, actor.email));
    await db.delete(bulletinTags).where(inArray(bulletinTags.name, tags));
    await db.delete(users).where(eq(users.id, id));
  }
});
