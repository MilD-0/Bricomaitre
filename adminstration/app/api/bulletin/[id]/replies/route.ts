import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '../../../../../db/client';
import { bulletinPosts, bulletinReplies } from '../../../../../db/schema';
import { bulletinReplySchema } from '../../../../../lib/bulletin';
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
  const parsed = bulletinReplySchema.safeParse(await req.json());
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

  await mutateEntityWithHistory(db, {
    entityType: 'bulletinReplies',
    entityId: postId,
    operation: 'create',
    actor: { email: userEmail, name: userName },
    execute: async (tx) => {
      await tx.insert(bulletinReplies).values({
        postId,
        authorId: session.user.id ?? null,
        authorName: userName,
        authorEmail: userEmail,
        body: parsed.data.body,
      });

      await tx.update(bulletinPosts).set({ updatedAt: new Date() }).where(eq(bulletinPosts.id, postId));
    },
  });

  return NextResponse.json({ ok: true });
}
