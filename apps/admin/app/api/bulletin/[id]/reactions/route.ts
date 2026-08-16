import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { bulletinPostReactions, bulletinPosts } from '@bric/db/schema';
import { bulletinReactionSchema } from '../../../../../lib/bulletin';
import { requireBulletinSession } from '../../../../../lib/bulletin-server';
import { mutateEntityWithHistory } from '../../../../../lib/action-history';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireBulletinSession();
  if (response || !session) {
    return response;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const postId = Number(id);
  const parsed = bulletinReactionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();
  const post = await db.query.bulletinPosts.findFirst({
    where: eq(bulletinPosts.id, postId),
  });

  if (!post) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const userEmail = session.user.email ?? 'unknown@example.com';
  const userName = session.user.name?.trim() || userEmail;
  const existing = await db.query.bulletinPostReactions.findFirst({
    where: and(
      eq(bulletinPostReactions.postId, postId),
      eq(bulletinPostReactions.userEmail, userEmail),
      eq(bulletinPostReactions.emoji, parsed.data.emoji),
    ),
  });

  await mutateEntityWithHistory(db, {
    entityType: 'bulletinPostReactions',
    entityId: existing?.id ?? postId,
    operation: existing ? 'delete' : 'create',
    actor: { email: userEmail, name: userName },
    execute: async (tx) => {
      if (existing) {
        await tx.delete(bulletinPostReactions).where(eq(bulletinPostReactions.id, existing.id));
        return;
      }

      await tx.insert(bulletinPostReactions).values({
        postId,
        userId: session.user.id ?? null,
        userName,
        userEmail,
        emoji: parsed.data.emoji,
      });
    },
  });

  return NextResponse.json({ ok: true, reacted: !existing });
}
