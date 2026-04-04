import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '../../../../../../db/client';
import { bulletinReplies, bulletinReplyReactions } from '../../../../../../db/schema';
import { bulletinReactionSchema } from '../../../../../../lib/bulletin';
import { requireBulletinSession } from '../../../../../../lib/bulletin-server';
import { mutateEntityWithHistory } from '../../../../../../lib/action-history';

export async function POST(req: NextRequest, { params }: { params: Promise<{ replyId: string }> }) {
  const { session, response } = await requireBulletinSession();
  if (response || !session) {
    return response;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { replyId } = await params;
  const numericReplyId = Number(replyId);
  const parsed = bulletinReactionSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();
  const reply = await db.query.bulletinReplies.findFirst({
    where: eq(bulletinReplies.id, numericReplyId),
  });

  if (!reply) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const userEmail = session.user.email ?? 'unknown@example.com';
  const userName = session.user.name?.trim() || userEmail;
  const existing = await db.query.bulletinReplyReactions.findFirst({
    where: and(
      eq(bulletinReplyReactions.replyId, numericReplyId),
      eq(bulletinReplyReactions.userEmail, userEmail),
      eq(bulletinReplyReactions.emoji, parsed.data.emoji),
    ),
  });

  await mutateEntityWithHistory(db, {
    entityType: 'bulletinReplyReactions',
    entityId: existing?.id ?? numericReplyId,
    operation: existing ? 'delete' : 'create',
    actor: { email: userEmail, name: userName },
    execute: async (tx) => {
      if (existing) {
        await tx.delete(bulletinReplyReactions).where(eq(bulletinReplyReactions.id, existing.id));
        return;
      }

      await tx.insert(bulletinReplyReactions).values({
        replyId: numericReplyId,
        userId: session.user.id ?? null,
        userName,
        userEmail,
        emoji: parsed.data.emoji,
      });
    },
  });

  return NextResponse.json({ ok: true, reacted: !existing });
}
