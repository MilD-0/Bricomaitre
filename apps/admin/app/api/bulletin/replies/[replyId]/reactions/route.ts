import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { bulletinReactionSchema } from '@/lib/bulletin';
import { requireBulletinSession } from '@/lib/bulletin-server';
import { BulletinReplyNotFoundError, setBulletinReplyReaction } from '@/lib/bulletin-mutations';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';

export async function POST(req: NextRequest, { params }: { params: Promise<{ replyId: string }> }) {
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
  const parsed = bulletinReactionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const userEmail = session.user.email ?? 'unknown@example.com';
  const userName = session.user.name?.trim() || userEmail;
  try {
    const result = await setBulletinReplyReaction(
      getDb(),
      numericReplyId,
      parsed.data.emoji,
      'toggle',
      { id: session.user.id, email: userEmail, name: userName },
    );
    return NextResponse.json({ ok: true, reacted: result.reacted });
  } catch (error) {
    if (error instanceof BulletinReplyNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    throw error;
  }
}
