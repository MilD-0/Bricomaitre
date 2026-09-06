import { ActionHistoryEntityNotFoundError } from '../../../../lib/action-history-state';
import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { auth } from '../../../../lib/auth';
import { readBrand } from '../../../../lib/brands-categories-api';
import { brandUpdateSchema } from '../../../../lib/brands-categories';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import { requireAppAccess, requireMutationAccess } from '../../../../lib/rbac';
import { revalidateStorefrontProductMeta } from '../../../../lib/storefront-revalidate';
import {
  deleteBrandThroughCanonicalWorkflow,
  updateBrandThroughCanonicalWorkflow,
} from '../../../../lib/taxonomy-mutations';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAppAccess();
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const numericId = parsePositiveIntegerId(id);

  if (!numericId) {
    return NextResponse.json({ error: 'Invalid brand id' }, { status: 400 });
  }

  const brand = await readBrand(numericId);

  if (!brand) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ id: numericId, name: brand.name, slug: brand.slug });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMutationAccess('brandsCategories');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const numericId = parsePositiveIntegerId(id);
  if (!numericId) {
    return NextResponse.json({ error: 'Invalid brand id' }, { status: 400 });
  }

  const parsed = brandUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };
  try {
    await updateBrandThroughCanonicalWorkflow(db, numericId, parsed.data, actor);
  } catch (error) {
    if (error instanceof ActionHistoryEntityNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    throw error;
  }

  await revalidateStorefrontProductMeta();

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMutationAccess('brandsCategories');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const numericId = parsePositiveIntegerId(id);
  if (!numericId) {
    return NextResponse.json({ error: 'Invalid brand id' }, { status: 400 });
  }

  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };

  try {
    await deleteBrandThroughCanonicalWorkflow(db, numericId, actor);
  } catch (error) {
    if (error instanceof ActionHistoryEntityNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    throw error;
  }

  await revalidateStorefrontProductMeta();

  return NextResponse.json({ ok: true });
}
