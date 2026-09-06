import { asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
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
  canManageBulletinContent,
  bulletinListQuerySchema,
  type BulletinAttachment,
  type BulletinReactionRecord,
  type BulletinReplyRecord,
  type BulletinPostRecord,
  type BulletinListQuery,
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
          slug: name,
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
          canDelete: canManageBulletinContent({
            authorId: row.authorId,
            userId: viewer.userId,
            permissions: viewer.permissions,
          }),
        },
      },
    ]);
  });

  return posts.map((post) => {
    const canManage = canManageBulletinContent({
      authorId: post.authorId,
      userId: viewer.userId,
      permissions: viewer.permissions,
    });
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
        canEdit: canManage,
        canDelete: canManage,
        canPin: canManage,
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

export async function loadBulletinData(
  viewer: {
    userId: string | null;
    permissions: PermissionKey[];
  },
  queryInput: Partial<BulletinListQuery> = {},
) {
  const db = getDb();
  const query = bulletinListQuerySchema.parse(queryInput);
  const where =
    query.tag === 'all'
      ? undefined
      : sql<boolean>`exists (
          select 1
          from ${bulletinPostTags}
          inner join ${bulletinTags} on ${bulletinTags.id} = ${bulletinPostTags.tagId}
          where ${bulletinPostTags.postId} = ${bulletinPosts.id}
            and ${bulletinTags.name} = ${query.tag}
        )`;
  const [{ value: totalItems = 0 }] = await db
    .select({ value: count() })
    .from(bulletinPosts)
    .where(where);
  const totalPages = Math.max(1, Math.ceil(totalItems / query.limit));
  const page = Math.min(query.page, totalPages);
  const sortOrder =
    query.sort === 'updated-asc'
      ? [asc(bulletinPosts.updatedAt), asc(bulletinPosts.id)]
      : query.sort === 'created-desc'
        ? [desc(bulletinPosts.createdAt), desc(bulletinPosts.id)]
        : [desc(bulletinPosts.updatedAt), desc(bulletinPosts.id)];
  const posts = await db
    .select()
    .from(bulletinPosts)
    .where(where)
    .orderBy(desc(bulletinPosts.pinned), ...sortOrder)
    .limit(query.limit)
    .offset((page - 1) * query.limit);
  const postIds = posts.map((post) => post.id);
  const noRows = Promise.resolve([]);
  const [tagRows, attachmentRows, replyRows, postReactionRows, tags] = await Promise.all([
    postIds.length === 0
      ? noRows
      : db
          .select({
            postId: bulletinPostTags.postId,
            tagName: bulletinTags.name,
          })
          .from(bulletinPostTags)
          .innerJoin(bulletinTags, eq(bulletinTags.id, bulletinPostTags.tagId))
          .where(inArray(bulletinPostTags.postId, postIds)),
    postIds.length === 0
      ? noRows
      : db
          .select({
            postId: bulletinPostAttachments.postId,
            fileName: bulletinPostAttachments.fileName,
            fileUrl: bulletinPostAttachments.fileUrl,
            fileKey: bulletinPostAttachments.fileKey,
            contentType: bulletinPostAttachments.contentType,
            size: bulletinPostAttachments.size,
          })
          .from(bulletinPostAttachments)
          .where(inArray(bulletinPostAttachments.postId, postIds)),
    postIds.length === 0
      ? noRows
      : db
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
          .where(inArray(bulletinReplies.postId, postIds))
          .orderBy(bulletinReplies.createdAt),
    postIds.length === 0
      ? noRows
      : db
          .select({
            postId: bulletinPostReactions.postId,
            emoji: bulletinPostReactions.emoji,
            userId: bulletinPostReactions.userId,
            userName: bulletinPostReactions.userName,
            userEmail: bulletinPostReactions.userEmail,
          })
          .from(bulletinPostReactions)
          .where(inArray(bulletinPostReactions.postId, postIds)),
    loadBulletinTagNames(),
  ]);
  const replyIds = replyRows.map((reply) => reply.id);
  const replyReactionRows =
    replyIds.length === 0
      ? []
      : await db
          .select({
            replyId: bulletinReplyReactions.replyId,
            emoji: bulletinReplyReactions.emoji,
            userId: bulletinReplyReactions.userId,
            userName: bulletinReplyReactions.userName,
            userEmail: bulletinReplyReactions.userEmail,
          })
          .from(bulletinReplyReactions)
          .where(inArray(bulletinReplyReactions.replyId, replyIds));

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
    pagination: {
      page,
      limit: query.limit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}
