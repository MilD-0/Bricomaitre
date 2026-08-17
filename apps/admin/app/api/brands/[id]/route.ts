import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { brands } from '@bric/db/schema';
import { mutateEntityWithHistory } from '../../../../lib/action-history';
import { auth } from '../../../../lib/auth';
import { readBrand, resolveBrandSlug } from '../../../../lib/brands-categories-api';
import { brandUpdateSchema } from '../../../../lib/brands-categories';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import { requireAppAccess, requireMutationAccess } from '../../../../lib/rbac';
import { revalidateStorefrontProductMeta } from '../../../../lib/storefront-revalidate';

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

  const existing = await readBrand(numericId);
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };
  const data = parsed.data;

  await mutateEntityWithHistory(db, {
    entityType: 'brands',
    entityId: numericId,
    operation: 'update',
    actor,
    execute: async (tx) => {
      const update: {
        name?: string;
        slug?: string;
        image?: string | null;
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
        update.slug = await resolveBrandSlug(data.name, numericId);
      }
      if (data.imageUrl !== undefined) update.image = data.imageUrl;
      if (data.status !== undefined) update.isActive = data.status === 'active';

      await tx.update(brands).set(update).where(eq(brands.id, numericId));
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
  const numericId = parsePositiveIntegerId(id);
  if (!numericId) {
    return NextResponse.json({ error: 'Invalid brand id' }, { status: 400 });
  }

  const existing = await readBrand(numericId);
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };

  await mutateEntityWithHistory(db, {
    entityType: 'brands',
    entityId: numericId,
    operation: 'delete',
    actor,
    execute: (tx) => tx.delete(brands).where(eq(brands.id, numericId)),
  });

  await revalidateStorefrontProductMeta();

  return NextResponse.json({ ok: true });
}
