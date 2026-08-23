import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { bulletinPostPatchSchema } from '../../../../lib/bulletin';
import { getBulletinViewer, requireBulletinSession } from '../../../../lib/bulletin-server';
import {
  BulletinMutationForbiddenError,
  BulletinPostNotFoundError,
  deleteBulletinPost,
  updateBulletinPost,
} from '../../../../lib/bulletin-mutations';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';

function mutationError(error: unknown) {
  if (error instanceof BulletinPostNotFoundError)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (error instanceof BulletinMutationForbiddenError)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'Unable to change Bulletin post.' },
    { status: 500 },
  );
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
  const viewer = getBulletinViewer(session);
  const parsed = bulletinPostPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await updateBulletinPost(getDb(), numericId, parsed.data, {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      permissions: viewer.permissions,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return mutationError(error);
  }
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
  const viewer = getBulletinViewer(session);
  try {
    await deleteBulletinPost(getDb(), numericId, {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      permissions: viewer.permissions,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return mutationError(error);
  }
}
