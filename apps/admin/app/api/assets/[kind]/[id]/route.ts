import { ActionHistoryEntityNotFoundError } from '../../../../../lib/action-history';
import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import {
  assetActiveToggleSchema,
  assetBannerSchema,
  assetReplacementRequestSchema,
  featuredProductGroupToggleSchema,
  featuredProductGroupSchema,
  productCardSchema,
} from '../../../../../lib/assets';
import { auth } from '../../../../../lib/auth';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import { requireMutationAccess } from '../../../../../lib/rbac';
import {
  deleteAdminAsset,
  replaceAdminAsset,
  updateAdminAssetStates,
} from '../../../../../lib/asset-mutations';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const denied = await requireMutationAccess('assets');
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
  const payload = await req.json().catch(() => null);
  if (payload === null) {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };

  try {
    if (kind === 'banner') {
      const parsed = assetActiveToggleSchema.safeParse(payload);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid toggle payload' }, { status: 400 });
      }

      await updateAdminAssetStates(
        db,
        {
          items: [{ kind: 'banner', id: numericId, ...parsed.data }],
        },
        actor,
      );
      return NextResponse.json({ ok: true });
    }

    if (kind === 'featured-group') {
      const parsed = featuredProductGroupToggleSchema.safeParse(payload);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid toggle payload' }, { status: 400 });
      }

      await updateAdminAssetStates(
        db,
        {
          items: [{ kind: 'featured-group', id: numericId, ...parsed.data }],
        },
        actor,
      );
      return NextResponse.json({ ok: true });
    }

    if (kind === 'product-card') {
      const parsed = assetActiveToggleSchema.safeParse(payload);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid toggle payload' }, { status: 400 });
      }

      await updateAdminAssetStates(
        db,
        {
          items: [{ kind: 'product-card', id: numericId, ...parsed.data }],
        },
        actor,
      );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unsupported asset kind' }, { status: 400 });
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
  const denied = await requireMutationAccess('assets');
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
  const body = assetReplacementRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }
  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };

  try {
    if (kind === 'banner') {
      const parsed = assetBannerSchema.safeParse(body.data.data);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
      }

      await replaceAdminAsset(db, 'banner', numericId, parsed.data, actor);
      return NextResponse.json({ ok: true });
    }

    if (kind === 'featured-group') {
      const parsed = featuredProductGroupSchema.safeParse(body.data.data);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
      }

      await replaceAdminAsset(db, 'featured-group', numericId, parsed.data, actor);
      return NextResponse.json({ ok: true });
    }

    if (kind === 'product-card') {
      const parsed = productCardSchema.safeParse(body.data.data);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
      }

      await replaceAdminAsset(db, 'product-card', numericId, parsed.data, actor);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unsupported asset kind' }, { status: 400 });
  } catch (error) {
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
  const denied = await requireMutationAccess('assets');
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
  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };

  try {
    if (kind === 'banner') {
      await deleteAdminAsset(db, 'banner', numericId, actor);
      return NextResponse.json({ ok: true });
    }

    if (kind === 'featured-group') {
      await deleteAdminAsset(db, 'featured-group', numericId, actor);
      return NextResponse.json({ ok: true });
    }

    if (kind === 'product-card') {
      await deleteAdminAsset(db, 'product-card', numericId, actor);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unsupported asset kind' }, { status: 400 });
  } catch (error) {
    if (error instanceof ActionHistoryEntityNotFoundError) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }
    throw error;
  }
}
