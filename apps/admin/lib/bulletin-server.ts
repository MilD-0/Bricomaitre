import { asc, desc, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getDb } from '@bric/db/client';
import {
  bulletinPostAttachments,
  bulletinPostReactions,
  bulletinPostTags,
  bulletinPosts,
  bulletinReplies,
  bulletinReplyReactions,
  bulletinTags,
} from '@bric/db/schema';
import {
  canDeleteBulletinReply,
  canDeleteBulletinPost,
  canEditBulletinPost,
  canPinBulletinPost,
  slugifyBulletinTag,
  type BulletinAttachment,
  type BulletinReactionRecord,
  type BulletinReplyRecord,
  type BulletinPostRecord,
} from './bulletin';
import { auth } from './auth';
import { normalizePermissions, type PermissionKey } from './permissions';

type Database = ReturnType<typeof getDb>;
export type BulletinTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function requireBulletinSession() {
  const session = await auth();

  if (!session?.user?.email) {
    return { session: null, response: unauthorizedResponse() };
  }

  if (!session.user.isAllowed) {
    return { session: null, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { session, response: null };
}

async function getOrCreateTagIds(tx: BulletinTransaction, names: string[]) {
  if (names.length === 0) {
    return [];
  }

  const existing = await tx.select().from(bulletinTags).where(inArray(bulletinTags.name, names));
  const existingByName = new Map(existing.map((tag) => [tag.name, tag.id]));
  const missingNames = names.filter((name) => !existingByName.has(name));

  if (missingNames.length > 0) {
    const inserted = await tx
      .insert(bulletinTags)
      .values(
        missingNames.map((name) => ({
          name,
          slug: slugifyBulletinTag(name),
        })),
      )
      .onConflictDoNothing()
      .returning({ id: bulletinTags.id, name: bulletinTags.name });

    inserted.forEach((tag) => existingByName.set(tag.name, tag.id));

    if (inserted.length !== missingNames.length) {
      const reloaded = await tx
        .select()
        .from(bulletinTags)
        .where(inArray(bulletinTags.name, names));
      reloaded.forEach((tag) => existingByName.set(tag.name, tag.id));
    }
  }

  return names.flatMap((name) => {
    const tagId = existingByName.get(name);
    return typeof tagId === 'number' ? [tagId] : [];
  });
}

export async function syncBulletinPostTags(
  tx: BulletinTransaction,
  postId: number,
  tagNames: string[],
) {
  await tx.delete(bulletinPostTags).where(eq(bulletinPostTags.postId, postId));

  const tagIds = await getOrCreateTagIds(tx, tagNames);
  if (tagIds.length === 0) {
    return;
  }

  await tx.insert(bulletinPostTags).values(
    tagIds.map((tagId) => ({
      postId,
      tagId,
    })),
  );
}

export async function syncBulletinPostAttachments(
  tx: BulletinTransaction,
  postId: number,
  attachments: BulletinAttachment[] | undefined,
) {
  await tx.delete(bulletinPostAttachments).where(eq(bulletinPostAttachments.postId, postId));

  if (!attachments || attachments.length === 0) {
    return;
  }

  await tx.insert(bulletinPostAttachments).values(
    attachments.map((attachment) => ({
      postId,
      fileName: attachment.fileName,
      fileUrl: attachment.fileUrl,
      fileKey: attachment.fileKey,
      contentType: attachment.contentType,
      size: attachment.size,
    })),
  );
}

function mapReactions(
  rows: Array<{
    targetId: number;
    emoji: string;
    userId: string | null;
    userName: string;
    userEmail: string;
  }>,
  viewerId: string | null,
) {
  const grouped = new Map<number, Map<string, BulletinReactionRecord>>();

  rows.forEach((row) => {
    const byEmoji = grouped.get(row.targetId) ?? new Map<string, BulletinReactionRecord>();
    const current = byEmoji.get(row.emoji) ?? {
      emoji: row.emoji,
      count: 0,
      reacted: false,
      users: [],
    };

    current.count += 1;
    current.reacted ||= row.userId !== null && row.userId === viewerId;
    current.users = [
      ...current.users,
      {
        id: row.userId,
        name: row.userName,
        email: row.userEmail,
      },
    ];

    byEmoji.set(row.emoji, current);
    grouped.set(row.targetId, byEmoji);
  });

  return grouped;
}

function mapBulletinPosts(
  posts: Array<{
    id: number;
    title: string;
    body: string;
    pinned: boolean;
    createdAt: Date;
    updatedAt: Date;
    authorId: string | null;
    authorName: string;
    authorEmail: string;
  }>,
  tagRows: Array<{ postId: number; tagName: string }>,
  attachmentRows: Array<{
    postId: number;
    fileName: string;
    fileUrl: string;
    fileKey: string;
    contentType: string;
    size: number;
  }>,
  replyRows: Array<{
    id: number;
    postId: number;
    body: string;
    createdAt: Date;
    updatedAt: Date;
    authorId: string | null;
    authorName: string;
    authorEmail: string;
  }>,
  postReactionRows: Array<{
    postId: number;
    emoji: string;
    userId: string | null;
    userName: string;
    userEmail: string;
  }>,
  replyReactionRows: Array<{
    replyId: number;
    emoji: string;
    userId: string | null;
    userName: string;
    userEmail: string;
  }>,
  viewer: { userId: string | null; permissions: PermissionKey[] },
): BulletinPostRecord[] {
  const tagsByPostId = new Map<number, string[]>();
  const attachmentsByPostId = new Map<number, BulletinAttachment[]>();
  const postReactionsByPostId = mapReactions(
    postReactionRows.map((row) => ({ ...row, targetId: row.postId })),
    viewer.userId,
  );
  const replyReactionsByReplyId = mapReactions(
    replyReactionRows.map((row) => ({ ...row, targetId: row.replyId })),
    viewer.userId,
  );
  const repliesByPostId = new Map<number, BulletinReplyRecord[]>();

  tagRows.forEach((row) => {
    tagsByPostId.set(row.postId, [...(tagsByPostId.get(row.postId) ?? []), row.tagName]);
  });

  attachmentRows.forEach((row) => {
    attachmentsByPostId.set(row.postId, [
      ...(attachmentsByPostId.get(row.postId) ?? []),
      {
        fileName: row.fileName,
        fileUrl: row.fileUrl,
        fileKey: row.fileKey,
        contentType: row.contentType,
        size: row.size,
      },
    ]);
  });

  replyRows.forEach((row) => {
    const reactions = Array.from(replyReactionsByReplyId.get(row.id)?.values() ?? []).sort(
      (left, right) => right.count - left.count || left.emoji.localeCompare(right.emoji),
    );
    repliesByPostId.set(row.postId, [
      ...(repliesByPostId.get(row.postId) ?? []),
      {
        id: row.id,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        author: {
          id: row.authorId,
          name: row.authorName,
          email: row.authorEmail,
        },
        reactions,
        permissions: {
          canDelete: canDeleteBulletinReply({
            replyAuthorId: row.authorId,
            userId: viewer.userId,
            permissions: viewer.permissions,
          }),
        },
      },
    ]);
  });

  return posts.map((post) => {
    const reactions = Array.from(postReactionsByPostId.get(post.id)?.values() ?? []).sort(
      (left, right) => right.count - left.count || left.emoji.localeCompare(right.emoji),
    );

    return {
      id: post.id,
      title: post.title,
      body: post.body,
      tags: tagsByPostId.get(post.id) ?? [],
      attachments: attachmentsByPostId.get(post.id) ?? [],
      reactions,
      replies: repliesByPostId.get(post.id) ?? [],
      pinned: post.pinned,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
      author: {
        id: post.authorId,
        name: post.authorName,
        email: post.authorEmail,
      },
      permissions: {
        canEdit: canEditBulletinPost({
          postAuthorId: post.authorId,
          userId: viewer.userId,
          permissions: viewer.permissions,
        }),
        canDelete: canDeleteBulletinPost({
          postAuthorId: post.authorId,
          userId: viewer.userId,
          permissions: viewer.permissions,
        }),
        canPin: canPinBulletinPost({
          postAuthorId: post.authorId,
          userId: viewer.userId,
          permissions: viewer.permissions,
        }),
      },
    };
  });
}

export function getBulletinViewer(session: {
  user: { id?: string | null; permissions?: unknown };
}) {
  return {
    userId: session.user.id ?? null,
    permissions: normalizePermissions(session.user.permissions),
  };
}

async function loadBulletinTagNames() {
  const tags = await getDb()
    .select({ name: bulletinTags.name })
    .from(bulletinTags)
    .orderBy(asc(bulletinTags.name));
  return tags.map((tag) => tag.name);
}

export async function loadBulletinData(viewer: {
  userId: string | null;
  permissions: PermissionKey[];
}) {
  const db = getDb();
  const [posts, tagRows, attachmentRows, replyRows, postReactionRows, replyReactionRows, tags] =
    await Promise.all([
      db
        .select()
        .from(bulletinPosts)
        .orderBy(desc(bulletinPosts.pinned), desc(bulletinPosts.updatedAt)),
      db
        .select({
          postId: bulletinPostTags.postId,
          tagName: bulletinTags.name,
        })
        .from(bulletinPostTags)
        .innerJoin(bulletinTags, eq(bulletinTags.id, bulletinPostTags.tagId)),
      db
        .select({
          postId: bulletinPostAttachments.postId,
          fileName: bulletinPostAttachments.fileName,
          fileUrl: bulletinPostAttachments.fileUrl,
          fileKey: bulletinPostAttachments.fileKey,
          contentType: bulletinPostAttachments.contentType,
          size: bulletinPostAttachments.size,
        })
        .from(bulletinPostAttachments),
      db
        .select({
          id: bulletinReplies.id,
          postId: bulletinReplies.postId,
          body: bulletinReplies.body,
          createdAt: bulletinReplies.createdAt,
          updatedAt: bulletinReplies.updatedAt,
          authorId: bulletinReplies.authorId,
          authorName: bulletinReplies.authorName,
          authorEmail: bulletinReplies.authorEmail,
        })
        .from(bulletinReplies)
        .orderBy(bulletinReplies.createdAt),
      db
        .select({
          postId: bulletinPostReactions.postId,
          emoji: bulletinPostReactions.emoji,
          userId: bulletinPostReactions.userId,
          userName: bulletinPostReactions.userName,
          userEmail: bulletinPostReactions.userEmail,
        })
        .from(bulletinPostReactions),
      db
        .select({
          replyId: bulletinReplyReactions.replyId,
          emoji: bulletinReplyReactions.emoji,
          userId: bulletinReplyReactions.userId,
          userName: bulletinReplyReactions.userName,
          userEmail: bulletinReplyReactions.userEmail,
        })
        .from(bulletinReplyReactions),
      loadBulletinTagNames(),
    ]);

  return {
    posts: mapBulletinPosts(
      posts,
      tagRows,
      attachmentRows,
      replyRows,
      postReactionRows,
      replyReactionRows,
      viewer,
    ),
    availableTags: tags,
  };
}
