import { desc, eq } from 'drizzle-orm';
import type { InferInsertModel } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import {
  bulletinPostAttachments,
  bulletinPostReactions,
  bulletinPostTags,
  bulletinPosts,
  bulletinReplies,
  bulletinReplyReactions,
  bulletinTags,
} from '@bric/db/schema';
import { bulletinPostSchema, canModerateBulletin } from '../../../lib/bulletin';
import {
  getBulletinViewer,
  loadBulletinTagNames,
  mapBulletinPosts,
  requireBulletinSession,
  syncBulletinPostAttachments,
  syncBulletinPostTags,
} from '../../../lib/bulletin-server';
import { mutateEntityWithHistory } from '../../../lib/action-history';

export async function GET() {
  const { session, response } = await requireBulletinSession();
  if (response || !session) {
    return response;
  }

  if (!hasDb()) {
    return NextResponse.json({
      posts: [],
      availableTags: [],
      currentUserId: session.user.id ?? null,
      permissions: { canModerate: false, canPost: true },
    });
  }

  const db = getDb();
  const viewer = getBulletinViewer(session);
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

  return NextResponse.json({
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
    currentUserId: session.user.id ?? null,
    permissions: {
      canModerate: canModerateBulletin(viewer.permissions),
      canPost: true,
    },
  });
}

export async function POST(req: NextRequest) {
  const { session, response } = await requireBulletinSession();
  if (response || !session) {
    return response;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const parsed = bulletinPostSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();
  const viewer = getBulletinViewer(session);
  const userEmail = session.user.email ?? 'unknown@example.com';
  const userName = session.user.name?.trim() || userEmail;
  const actor = { email: userEmail, name: userName };
  const data = {
    ...parsed.data,
    pinned: parsed.data.pinned && canModerateBulletin(viewer.permissions),
  };

  await mutateEntityWithHistory(db, {
    entityType: 'bulletinPosts',
    operation: 'create',
    actor,
    execute: async (tx) => {
      const values: InferInsertModel<typeof bulletinPosts> = {
        authorId: session.user.id ?? null,
        authorName: userName,
        authorEmail: userEmail,
        title: data.title,
        body: data.body,
        pinned: data.pinned,
      };

      const inserted = await tx
        .insert(bulletinPosts)
        .values(values)
        .returning({ id: bulletinPosts.id });

      const postId = inserted[0]?.id;
      if (!postId) {
        throw new Error('Unable to create bulletin post');
      }

      await syncBulletinPostTags(tx, postId, data.tags);
      await syncBulletinPostAttachments(tx, postId, data.attachments);
      return inserted;
    },
    resolveEntityId: (rows) => rows[0]?.id,
  });

  return NextResponse.json({ ok: true });
}
