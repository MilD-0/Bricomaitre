import type { InferInsertModel } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { bulletinPosts } from '@bric/db/schema';
import { bulletinPostSchema, canModerateBulletin } from '../../../lib/bulletin';
import {
  getBulletinViewer,
  loadBulletinData,
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

  const viewer = getBulletinViewer(session);
  const data = await loadBulletinData(viewer);

  return NextResponse.json({
    ...data,
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
