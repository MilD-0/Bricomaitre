import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { bulletinReplies } from '@bric/db/schema';
import { canDeleteBulletinReply } from '../../../../../lib/bulletin';
import { getBulletinViewer, requireBulletinSession } from '../../../../../lib/bulletin-server';
import { mutateEntityWithHistory } from '../../../../../lib/action-history';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ replyId: string }> }) {
  const { session, response } = await requireBulletinSession();
  if (response || !session) {
    return response;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { replyId } = await params;
  const numericReplyId = parsePositiveIntegerId(replyId);
  if (numericReplyId === null) {
    return NextResponse.json({ error: 'Invalid bulletin reply id' }, { status: 400 });
  }
  const db = getDb();
  const reply = await db.query.bulletinReplies.findFirst({
    where: eq(bulletinReplies.id, numericReplyId),
  });

  if (!reply) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const viewer = getBulletinViewer(session);
  if (
    !canDeleteBulletinReply({
      replyAuthorId: reply.authorId,
      userId: session.user.id,
      permissions: viewer.permissions,
    })
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await mutateEntityWithHistory(db, {
    entityType: 'bulletinReplies',
    entityId: numericReplyId,
    operation: 'delete',
    actor: { email: session.user.email, name: session.user.name },
    execute: async (tx) => {
      await tx.delete(bulletinReplies).where(eq(bulletinReplies.id, numericReplyId));
    },
  });

  return NextResponse.json({ ok: true });
}
