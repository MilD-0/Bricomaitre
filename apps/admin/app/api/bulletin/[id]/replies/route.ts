import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { bulletinReplySchema } from '../../../../../lib/bulletin';
import { requireBulletinSession } from '../../../../../lib/bulletin-server';
import {
  BulletinPostNotFoundError,
  createBulletinReply,
} from '../../../../../lib/bulletin-mutations';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireBulletinSession();
  if (response || !session) {
    return response;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const postId = parsePositiveIntegerId(id);
  if (postId === null) {
    return NextResponse.json({ error: 'Invalid bulletin post id' }, { status: 400 });
  }
  const parsed = bulletinReplySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();
  const userEmail = session.user.email ?? 'unknown@example.com';
  const userName = session.user.name?.trim() || userEmail;
  try {
    await createBulletinReply(db, postId, parsed.data, {
      id: session.user.id,
      email: userEmail,
      name: userName,
    });
  } catch (error) {
    if (error instanceof BulletinPostNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
