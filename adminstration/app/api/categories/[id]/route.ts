import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '../../../../db/client';
import { categories } from '../../../../db/schema';
import { mutateEntityWithHistory } from '../../../../lib/action-history';
import { auth } from '../../../../lib/auth';
import { readCategory, resolveCategorySlug } from '../../../../lib/brands-categories-api';
import { categoryUpdateSchema } from '../../../../lib/brands-categories';
import { requireAppAccess, requireMutationAccess } from '../../../../lib/rbac';
import { revalidateStorefrontProductMeta } from '../../../../lib/storefront-revalidate';

function parseCategoryId(id: string) {
  const numericId = Number(id);
  return Number.isInteger(numericId) && numericId > 0 ? numericId : null;
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAppAccess();
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const numericId = parseCategoryId(id);
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
  const denied = await requireMutationAccess('brandsCategories');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const numericId = parseCategoryId(id);
  if (!numericId) {
    return NextResponse.json({ error: 'Invalid category id' }, { status: 400 });
  }

  const parsed = categoryUpdateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await readCategory(numericId);
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };
  const data = parsed.data;

  await mutateEntityWithHistory(db, {
    entityType: 'categories',
    entityId: numericId,
    operation: 'update',
    actor,
    execute: async (tx) => {
      const update: {
        name?: string;
        slug?: string;
        nameAr?: string | null;
        image?: string | null;
        parentId?: number | null;
        isActive?: boolean;
        updatedAt: Date;
        updatedBy: string | null;
        updatedByName: string | null;
      } = {
        updatedAt: new Date(),
        updatedBy: actor.email ?? null,
        updatedByName: actor.name ?? null,
      };

      if (data.name !== undefined) {
        update.name = data.name;
        update.slug = await resolveCategorySlug(data.name, numericId);
      }
      if (data.nameAr !== undefined) update.nameAr = data.nameAr;
      if (data.imageUrl !== undefined) update.image = data.imageUrl;
      if (data.parentId !== undefined) update.parentId = data.parentId ?? null;
      if (data.status !== undefined) update.isActive = data.status === 'active';

      await tx.update(categories).set(update).where(eq(categories.id, numericId));
    },
  });

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
  const numericId = parseCategoryId(id);
  if (!numericId) {
    return NextResponse.json({ error: 'Invalid category id' }, { status: 400 });
  }

  const existing = await readCategory(numericId);
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };

  await mutateEntityWithHistory(db, {
    entityType: 'categories',
    entityId: numericId,
    operation: 'delete',
    actor,
    execute: (tx) => tx.delete(categories).where(eq(categories.id, numericId)),
  });

  await revalidateStorefrontProductMeta();

  return NextResponse.json({ ok: true });
}
