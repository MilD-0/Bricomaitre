import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { bulletinPostAttachments, bulletinPostTags, bulletinPosts } from '@bric/db/schema';
import {
  bulletinPostPatchSchema,
  canDeleteBulletinPost,
  canEditBulletinPost,
  canModerateBulletin,
} from '../../../../lib/bulletin';
import {
  getBulletinViewer,
  requireBulletinSession,
  syncBulletinPostAttachments,
  syncBulletinPostTags,
} from '../../../../lib/bulletin-server';
import { mutateEntityWithHistory } from '../../../../lib/action-history';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';

async function loadPost(id: number) {
  return getDb().query.bulletinPosts.findFirst({
    where: eq(bulletinPosts.id, id),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireBulletinSession();
  if (response || !session) {
    return response;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const numericId = parsePositiveIntegerId(id);
  if (numericId === null) {
    return NextResponse.json({ error: 'Invalid bulletin post id' }, { status: 400 });
  }
  const post = await loadPost(numericId);

  if (!post) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const viewer = getBulletinViewer(session);
  if (
    !canEditBulletinPost({
      postAuthorId: post.authorId,
      userId: session.user.id,
      permissions: viewer.permissions,
    })
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = bulletinPostPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const values = parsed.data;
  const actor = { email: session.user.email, name: session.user.name };
  const db = getDb();

  await mutateEntityWithHistory(db, {
    entityType: 'bulletinPosts',
    entityId: numericId,
    operation: 'update',
    actor,
    execute: async (tx) => {
      const update: {
        title?: string;
        body?: string;
        pinned?: boolean;
        updatedAt: Date;
      } = {
        updatedAt: new Date(),
      };

      if (values.title !== undefined) {
        update.title = values.title;
      }

      if (values.body !== undefined) {
        update.body = values.body;
      }

      if (values.pinned !== undefined) {
        update.pinned = canModerateBulletin(viewer.permissions)
          ? values.pinned
          : post.authorId === session.user.id
            ? values.pinned
            : post.pinned;
      }

      await tx.update(bulletinPosts).set(update).where(eq(bulletinPosts.id, numericId));

      if (values.tags !== undefined) {
        await syncBulletinPostTags(tx, numericId, values.tags);
      }

      if (values.attachments !== undefined) {
        await syncBulletinPostAttachments(tx, numericId, values.attachments);
      }
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireBulletinSession();
  if (response || !session) {
    return response;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const numericId = parsePositiveIntegerId(id);
  if (numericId === null) {
    return NextResponse.json({ error: 'Invalid bulletin post id' }, { status: 400 });
  }
  const post = await loadPost(numericId);

  if (!post) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const viewer = getBulletinViewer(session);
  if (
    !canDeleteBulletinPost({
      postAuthorId: post.authorId,
      userId: session.user.id,
      permissions: viewer.permissions,
    })
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await mutateEntityWithHistory(getDb(), {
    entityType: 'bulletinPosts',
    entityId: numericId,
    operation: 'delete',
    actor: { email: session.user.email, name: session.user.name },
    execute: async (tx) => {
      await tx.delete(bulletinPostAttachments).where(eq(bulletinPostAttachments.postId, numericId));
      await tx.delete(bulletinPostTags).where(eq(bulletinPostTags.postId, numericId));
      await tx.delete(bulletinPosts).where(eq(bulletinPosts.id, numericId));
    },
  });

  return NextResponse.json({ ok: true });
}
