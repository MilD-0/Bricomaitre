import { ActionHistoryEntityNotFoundError } from '../../../../../lib/action-history';
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { getDb, hasDb } from '@bric/db/client';
import {
  assetActiveToggleSchema,
  assetReplacementRequestSchema,
  featuredProductGroupToggleSchema,
} from '../../../../../lib/assets';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import { requireMutationAccess } from '../../../../../lib/rbac';
import {
  adminAssetKindSchema,
  deleteAdminAsset,
  replaceAdminAsset,
  updateAdminAssetStates,
} from '../../../../../lib/asset-mutations';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { response: denied, session } = await requireMutationAccess('assets');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { kind, id } = await params;
  const numericId = parsePositiveIntegerId(id);
  if (numericId === null) {
    return NextResponse.json({ error: 'Invalid asset id' }, { status: 400 });
  }
  const resolvedKind = adminAssetKindSchema.safeParse(kind);
  if (!resolvedKind.success)
    return NextResponse.json({ error: 'Unsupported asset kind' }, { status: 400 });
  const payload = await req.json().catch(() => null);
  if (payload === null) {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  const db = getDb();

  const actor = { email: session?.user?.email, name: session?.user?.name };

  const parsed = (
    resolvedKind.data === 'featured-group'
      ? featuredProductGroupToggleSchema
      : assetActiveToggleSchema
  ).safeParse(payload);
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid toggle payload' }, { status: 400 });
  try {
    await updateAdminAssetStates(
      db,
      { items: [{ kind: resolvedKind.data, id: numericId, ...parsed.data }] },
      actor,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ActionHistoryEntityNotFoundError) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }
    throw error;
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { response: denied, session } = await requireMutationAccess('assets');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { kind, id } = await params;
  const numericId = parsePositiveIntegerId(id);
  if (numericId === null) {
    return NextResponse.json({ error: 'Invalid asset id' }, { status: 400 });
  }
  const resolvedKind = adminAssetKindSchema.safeParse(kind);
  if (!resolvedKind.success)
    return NextResponse.json({ error: 'Unsupported asset kind' }, { status: 400 });
  const body = assetReplacementRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }
  const db = getDb();

  const actor = { email: session?.user?.email, name: session?.user?.name };

  try {
    await replaceAdminAsset(db, resolvedKind.data, numericId, body.data.data, actor);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ZodError)
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    if (error instanceof ActionHistoryEntityNotFoundError) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }
    throw error;
  }
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { response: denied, session } = await requireMutationAccess('assets');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { kind, id } = await params;
  const numericId = parsePositiveIntegerId(id);
  if (numericId === null) {
    return NextResponse.json({ error: 'Invalid asset id' }, { status: 400 });
  }
  const resolvedKind = adminAssetKindSchema.safeParse(kind);
  if (!resolvedKind.success)
    return NextResponse.json({ error: 'Unsupported asset kind' }, { status: 400 });
  const db = getDb();

  const actor = { email: session?.user?.email, name: session?.user?.name };

  try {
    await deleteAdminAsset(db, resolvedKind.data, numericId, actor);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ActionHistoryEntityNotFoundError) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }
    throw error;
  }
}
