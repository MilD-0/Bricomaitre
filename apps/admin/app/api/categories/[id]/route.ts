import { ActionHistoryEntityNotFoundError } from '@/lib/action-history-state';
import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readCategory } from '@/lib/brands-categories-api';
import { categoryUpdateSchema } from '@/lib/brands-categories';
import { CategoryHierarchyError } from '@/lib/category-hierarchy';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import { requireAppAccess, requireMutationAccess } from '@/lib/rbac';
import { revalidateStorefrontProductMeta } from '@/lib/storefront-revalidate';
import {
  deleteCategoryThroughCanonicalWorkflow,
  updateCategoryThroughCanonicalWorkflow,
} from '@/lib/taxonomy-mutations';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response: denied } = await requireAppAccess();
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const numericId = parsePositiveIntegerId(id);
  if (!numericId) {
    return NextResponse.json({ error: 'Invalid category id' }, { status: 400 });
  }

  const category = await readCategory(numericId);
  if (!category) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(category);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response: denied, session } = await requireMutationAccess('brandsCategories');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const numericId = parsePositiveIntegerId(id);
  if (!numericId) {
    return NextResponse.json({ error: 'Invalid category id' }, { status: 400 });
  }

  const parsed = categoryUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();

  const actor = { email: session?.user?.email, name: session?.user?.name };
  try {
    await updateCategoryThroughCanonicalWorkflow(db, numericId, parsed.data, actor);
  } catch (error) {
    if (error instanceof CategoryHierarchyError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    if (error instanceof ActionHistoryEntityNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    throw error;
  }

  await revalidateStorefrontProductMeta();

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response: denied, session } = await requireMutationAccess('brandsCategories');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const numericId = parsePositiveIntegerId(id);
  if (!numericId) {
    return NextResponse.json({ error: 'Invalid category id' }, { status: 400 });
  }

  const db = getDb();

  const actor = { email: session?.user?.email, name: session?.user?.name };

  try {
    await deleteCategoryThroughCanonicalWorkflow(db, numericId, actor);
  } catch (error) {
    if (error instanceof ActionHistoryEntityNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    throw error;
  }

  await revalidateStorefrontProductMeta();

  return NextResponse.json({ ok: true });
}
