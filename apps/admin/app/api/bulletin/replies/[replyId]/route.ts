import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { getBulletinViewer, requireBulletinSession } from '../../../../../lib/bulletin-server';
import {
  BulletinMutationForbiddenError,
  BulletinReplyNotFoundError,
  deleteBulletinReply,
} from '../../../../../lib/bulletin-mutations';
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
  const viewer = getBulletinViewer(session);
  try {
    await deleteBulletinReply(getDb(), numericReplyId, {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      permissions: viewer.permissions,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof BulletinReplyNotFoundError)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (error instanceof BulletinMutationForbiddenError)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to delete Bulletin reply.' },
      { status: 500 },
    );
  }
}
