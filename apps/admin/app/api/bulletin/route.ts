import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { bulletinPostSchema, canModerateBulletin } from '../../../lib/bulletin';
import {
  getBulletinViewer,
  loadBulletinData,
  requireBulletinSession,
} from '../../../lib/bulletin-server';
import { createBulletinPost } from '../../../lib/bulletin-mutations';

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
  await createBulletinPost(db, parsed.data, {
    id: session.user.id,
    email: userEmail,
    name: userName,
    permissions: viewer.permissions,
  });

  return NextResponse.json({ ok: true });
}
