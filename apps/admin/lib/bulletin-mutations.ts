import type { InferInsertModel } from 'drizzle-orm';
import { and, eq } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import {
  bulletinPostAttachments,
  bulletinPostReactions,
  bulletinPosts,
  bulletinPostTags,
  bulletinReplies,
  bulletinReplyReactions,
} from '@bric/db/schema';

import { mutateEntityWithHistory } from './action-history';
import {
  bulletinPostPatchSchema,
  bulletinPostSchema,
  bulletinReactionSchema,
  bulletinReplySchema,
  canDeleteBulletinPost,
  canDeleteBulletinReply,
  canEditBulletinPost,
  canModerateBulletin,
} from './bulletin';
import { syncBulletinPostAttachments, syncBulletinPostTags } from './bulletin-server';
import type { PermissionKey } from './permissions';
import { deletePrivateS3Object } from './s3-upload';

type Database = ReturnType<typeof getDb>;

export type BulletinMutationActor = {
  id?: string | null;
  email: string;
  name: string;
  permissions?: readonly PermissionKey[];
};

export class BulletinPostNotFoundError extends Error {
  constructor(readonly postId: number) {
    super(`Bulletin post ${postId} was not found.`);
    this.name = 'BulletinPostNotFoundError';
  }
}

export class BulletinReplyNotFoundError extends Error {
  constructor(readonly replyId: number) {
    super(`Bulletin reply ${replyId} was not found.`);
    this.name = 'BulletinReplyNotFoundError';
  }
}

export class BulletinMutationForbiddenError extends Error {
  constructor(
    readonly resource: 'post' | 'reply',
    readonly resourceId: number,
  ) {
    super(`You cannot change Bulletin ${resource} ${resourceId}.`);
    this.name = 'BulletinMutationForbiddenError';
  }
}

export async function setBulletinPostReaction(
  db: Database,
  postId: number,
  emojiInput: string,
  desired: 'add' | 'remove' | 'toggle',
  actor: BulletinMutationActor,
) {
  const { emoji } = bulletinReactionSchema.parse({ emoji: emojiInput });
  const post = await db.query.bulletinPosts.findFirst({
    where: eq(bulletinPosts.id, postId),
  });
  if (!post) throw new BulletinPostNotFoundError(postId);
  const existing = await db.query.bulletinPostReactions.findFirst({
    where: and(
      eq(bulletinPostReactions.postId, postId),
      eq(bulletinPostReactions.userEmail, actor.email),
      eq(bulletinPostReactions.emoji, emoji),
    ),
  });
  const shouldReact = desired === 'toggle' ? !existing : desired === 'add';
  if (Boolean(existing) === shouldReact) {
    return { id: postId, emoji, reacted: shouldReact, changed: false };
  }

  await mutateEntityWithHistory(db, {
    entityType: 'bulletinPostReactions',
    entityId: existing?.id ?? postId,
    operation: existing ? 'delete' : 'create',
    actor,
    execute: async (tx) => {
      if (existing) {
        await tx.delete(bulletinPostReactions).where(eq(bulletinPostReactions.id, existing.id));
      } else {
        await tx.insert(bulletinPostReactions).values({
          postId,
          userId: actor.id ?? null,
          userName: actor.name,
          userEmail: actor.email,
          emoji,
        });
      }
    },
  });
  return { id: postId, emoji, reacted: shouldReact, changed: true };
}

export async function setBulletinReplyReaction(
  db: Database,
  replyId: number,
  emojiInput: string,
  desired: 'add' | 'remove' | 'toggle',
  actor: BulletinMutationActor,
) {
  const { emoji } = bulletinReactionSchema.parse({ emoji: emojiInput });
  const reply = await db.query.bulletinReplies.findFirst({
    where: eq(bulletinReplies.id, replyId),
  });
  if (!reply) throw new BulletinReplyNotFoundError(replyId);
  const existing = await db.query.bulletinReplyReactions.findFirst({
    where: and(
      eq(bulletinReplyReactions.replyId, replyId),
      eq(bulletinReplyReactions.userEmail, actor.email),
      eq(bulletinReplyReactions.emoji, emoji),
    ),
  });
  const shouldReact = desired === 'toggle' ? !existing : desired === 'add';
  if (Boolean(existing) === shouldReact) {
    return { id: replyId, postId: reply.postId, emoji, reacted: shouldReact, changed: false };
  }

  await mutateEntityWithHistory(db, {
    entityType: 'bulletinReplyReactions',
    entityId: existing?.id ?? replyId,
    operation: existing ? 'delete' : 'create',
    actor,
    execute: async (tx) => {
      if (existing) {
        await tx.delete(bulletinReplyReactions).where(eq(bulletinReplyReactions.id, existing.id));
      } else {
        await tx.insert(bulletinReplyReactions).values({
          replyId,
          userId: actor.id ?? null,
          userName: actor.name,
          userEmail: actor.email,
          emoji,
        });
      }
    },
  });
  return { id: replyId, postId: reply.postId, emoji, reacted: shouldReact, changed: true };
}

export async function createBulletinPost(
  db: Database,
  input: unknown,
  actor: BulletinMutationActor,
) {
  const parsed = bulletinPostSchema.parse(input);
  const data = {
    ...parsed,
    pinned: parsed.pinned && canModerateBulletin(actor.permissions),
  };

  const rows = await mutateEntityWithHistory(db, {
    entityType: 'bulletinPosts',
    operation: 'create',
    actor,
    execute: async (tx) => {
      const values: InferInsertModel<typeof bulletinPosts> = {
        authorId: actor.id ?? null,
        authorName: actor.name,
        authorEmail: actor.email,
        title: data.title,
        body: data.body,
        pinned: data.pinned,
      };
      const inserted = await tx
        .insert(bulletinPosts)
        .values(values)
        .returning({ id: bulletinPosts.id });
      const postId = inserted[0]?.id;
      if (!postId) throw new Error('Unable to create bulletin post');
      await syncBulletinPostTags(tx, postId, data.tags);
      await syncBulletinPostAttachments(tx, postId, data.attachments);
      return inserted;
    },
    resolveEntityId: (inserted) => inserted[0]?.id,
  });

  const postId = rows[0]?.id;
  if (!postId) throw new Error('Unable to create bulletin post');
  return { id: postId, pinned: data.pinned };
}

export async function createBulletinReply(
  db: Database,
  postId: number,
  input: unknown,
  actor: BulletinMutationActor,
) {
  const data = bulletinReplySchema.parse(input);
  const post = await db.query.bulletinPosts.findFirst({
    where: eq(bulletinPosts.id, postId),
  });
  if (!post) throw new BulletinPostNotFoundError(postId);

  await mutateEntityWithHistory(db, {
    entityType: 'bulletinReplies',
    entityId: postId,
    operation: 'create',
    actor,
    execute: async (tx) => {
      await tx.insert(bulletinReplies).values({
        postId,
        authorId: actor.id ?? null,
        authorName: actor.name,
        authorEmail: actor.email,
        body: data.body,
      });
      await tx
        .update(bulletinPosts)
        .set({ updatedAt: new Date() })
        .where(eq(bulletinPosts.id, postId));
    },
  });

  return { postId };
}

export async function updateBulletinPost(
  db: Database,
  postId: number,
  input: unknown,
  actor: BulletinMutationActor,
) {
  const values = bulletinPostPatchSchema.parse(input);
  const post = await db.query.bulletinPosts.findFirst({
    where: eq(bulletinPosts.id, postId),
  });
  if (!post) throw new BulletinPostNotFoundError(postId);
  if (
    !canEditBulletinPost({
      postAuthorId: post.authorId,
      userId: actor.id,
      permissions: actor.permissions,
    })
  ) {
    throw new BulletinMutationForbiddenError('post', postId);
  }

  let removedAttachmentKeys: string[] = [];
  await mutateEntityWithHistory(db, {
    entityType: 'bulletinPosts',
    entityId: postId,
    operation: 'update',
    actor,
    execute: async (tx) => {
      const update: {
        title?: string;
        body?: string;
        pinned?: boolean;
        updatedAt: Date;
      } = { updatedAt: new Date() };
      if (values.title !== undefined) update.title = values.title;
      if (values.body !== undefined) update.body = values.body;
      if (values.pinned !== undefined) {
        update.pinned =
          canModerateBulletin(actor.permissions) || post.authorId === actor.id
            ? values.pinned
            : post.pinned;
      }
      await tx.update(bulletinPosts).set(update).where(eq(bulletinPosts.id, postId));
      if (values.tags !== undefined) await syncBulletinPostTags(tx, postId, values.tags);
      if (values.attachments !== undefined)
        removedAttachmentKeys = await syncBulletinPostAttachments(tx, postId, values.attachments);
    },
  });

  await Promise.all(
    removedAttachmentKeys
      .filter((key) => key.startsWith('bulletin/'))
      .map((key) => deletePrivateS3Object(key).catch(() => undefined)),
  );

  return {
    id: postId,
    updatedFields: Object.keys(values),
    pinned: values.pinned ?? post.pinned,
  };
}

export async function deleteBulletinPost(
  db: Database,
  postId: number,
  actor: BulletinMutationActor,
) {
  const post = await db.query.bulletinPosts.findFirst({
    where: eq(bulletinPosts.id, postId),
  });
  if (!post) throw new BulletinPostNotFoundError(postId);
  if (
    !canDeleteBulletinPost({
      postAuthorId: post.authorId,
      userId: actor.id,
      permissions: actor.permissions,
    })
  ) {
    throw new BulletinMutationForbiddenError('post', postId);
  }

  const attachments = await db
    .select({ fileKey: bulletinPostAttachments.fileKey })
    .from(bulletinPostAttachments)
    .where(eq(bulletinPostAttachments.postId, postId));

  await mutateEntityWithHistory(db, {
    entityType: 'bulletinPosts',
    entityId: postId,
    operation: 'delete',
    actor,
    execute: async (tx) => {
      await tx.delete(bulletinPostAttachments).where(eq(bulletinPostAttachments.postId, postId));
      await tx.delete(bulletinPostTags).where(eq(bulletinPostTags.postId, postId));
      await tx.delete(bulletinPosts).where(eq(bulletinPosts.id, postId));
    },
  });
  await Promise.all(
    attachments
      .map((attachment) => attachment.fileKey)
      .filter((key) => key.startsWith('bulletin/'))
      .map((key) => deletePrivateS3Object(key).catch(() => undefined)),
  );
  return { id: postId, deleted: true as const };
}

export async function deleteBulletinReply(
  db: Database,
  replyId: number,
  actor: BulletinMutationActor,
) {
  const reply = await db.query.bulletinReplies.findFirst({
    where: eq(bulletinReplies.id, replyId),
  });
  if (!reply) throw new BulletinReplyNotFoundError(replyId);
  if (
    !canDeleteBulletinReply({
      replyAuthorId: reply.authorId,
      userId: actor.id,
      permissions: actor.permissions,
    })
  ) {
    throw new BulletinMutationForbiddenError('reply', replyId);
  }

  await mutateEntityWithHistory(db, {
    entityType: 'bulletinReplies',
    entityId: replyId,
    operation: 'delete',
    actor,
    execute: async (tx) => {
      await tx.delete(bulletinReplies).where(eq(bulletinReplies.id, replyId));
    },
  });
  return { id: replyId, postId: reply.postId, deleted: true as const };
}
