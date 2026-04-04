import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { getDb, hasDb } from '../../../../../db/client';
import { brands, categories, importBatches, orders, products } from '../../../../../db/schema';
import { mutateEntityWithHistory } from '../../../../../lib/action-history';
import { brandUpdateSchema, categoryUpdateSchema } from '../../../../../lib/brands-categories';
import { entityStatusSchema, entityFormSchema, type EntityFormValues } from '../../../../../lib/permissions';
import { resolveUniqueSlug } from '../../../../../lib/slug';

const entityPatchSchema = entityFormSchema.partial();
import { auth } from '../../../../../lib/auth';
import { getEntityMutationResource, requireMutationAccess } from '../../../../../lib/rbac';

function isMissingAuditColumnError(error: unknown) {
  return (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === '42703'
  );
}

async function resolveEntitySlug(
  entityType: 'brands' | 'categories',
  value: string,
  currentId: number,
) {
  const db = getDb() as {
    query?: {
      brands?: { findFirst?: (input: unknown) => Promise<{ id: number } | undefined> };
      categories?: { findFirst?: (input: unknown) => Promise<{ id: number } | undefined> };
    };
  };

  const entityQueries = {
    brands: db.query?.brands?.findFirst,
    categories: db.query?.categories?.findFirst,
  };
  const findFirst = entityQueries[entityType];

  if (!findFirst) {
    return resolveUniqueSlug(value, async () => false);
  }

  return resolveUniqueSlug(value, async (slug) => {
    const existing = await findFirst({
      columns: { id: true },
      where: (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        table: any,
        helpers: { and: typeof import('drizzle-orm').and; eq: typeof import('drizzle-orm').eq; ne: typeof import('drizzle-orm').ne },
      ) => helpers.and(helpers.eq(table.slug, slug), helpers.ne(table.id, currentId)),
    });

    return Boolean(existing);
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ entityType: string; id: string }> }) {
  const { entityType, id } = await params;
  const resource = getEntityMutationResource(entityType);

  if (!resource) {
    return NextResponse.json({ error: 'Read only entity type' }, { status: 400 });
  }

  const denied = await requireMutationAccess(resource);
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  // Use partial schema for brands and categories to support both full updates and status-only patches
  const schemaToUse = (entityType === 'brands' || entityType === 'categories') ? entityPatchSchema : entityStatusSchema;
  const rawBody = await req.json();
  const parsed = schemaToUse.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const body = rawBody as Partial<EntityFormValues> & {
    imageUrl?: string | null;
    parentId?: number | null;
    nameAr?: string | null;
    slug?: string | null;
  };
  const numericId = Number(id);
  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };

  if (entityType === 'products') {
    await mutateEntityWithHistory(db, {
      entityType,
      entityId: numericId,
      operation: 'update',
      actor,
      execute: (tx) => tx.update(products).set({ inStock: body.status === 'active', updatedAt: new Date() }).where(eq(products.id, numericId)),
    });
    return NextResponse.json({ ok: true });
  }
  if (entityType === 'orders') {
    await mutateEntityWithHistory(db, {
      entityType,
      entityId: numericId,
      operation: 'update',
      actor,
      execute: (tx) => tx.update(orders).set({ confirmed: body.status === 'active' ? 2 : 0, noAnswerCount: 0, updatedAt: new Date() }).where(eq(orders.id, numericId)),
    });
    return NextResponse.json({ ok: true });
  }
  if (entityType === 'brands') {
    const values = brandUpdateSchema.safeParse(body);
    if (!values.success && body.imageUrl === undefined) {
      return NextResponse.json({ error: values.error.flatten() }, { status: 400 });
    }
    const update: {
      name?: string;
      slug?: string;
      isActive?: boolean;
      image?: string | null;
      updatedAt: Date;
      updatedBy?: string | null;
      updatedByName?: string | null;
    } = {
      updatedAt: new Date(),
      updatedBy: actor.email ?? null,
      updatedByName: actor.name ?? null,
    };
    if (values.success) {
      if (values.data.name !== undefined) update.name = values.data.name;
      if (values.data.name !== undefined) update.slug = await resolveEntitySlug('brands', values.data.name, numericId);
      if (values.data.status !== undefined) update.isActive = values.data.status === 'active';
      if (values.data.imageUrl !== undefined) update.image = values.data.imageUrl;
    }
    await mutateEntityWithHistory(db, {
      entityType,
      entityId: numericId,
      operation: 'update',
      actor,
      execute: (tx) =>
        tx.update(brands).set(update).where(eq(brands.id, numericId)).catch((error) => {
          if (!isMissingAuditColumnError(error)) {
            throw error;
          }

          return tx
            .update(brands)
            .set({
              name: update.name,
              slug: update.slug,
              isActive: update.isActive,
              image: update.image,
              updatedAt: update.updatedAt,
            })
            .where(eq(brands.id, numericId));
        }),
    });
    return NextResponse.json({ ok: true });
  }
  if (entityType === 'categories') {
    const values = categoryUpdateSchema.safeParse(body);
    if (!values.success && body.status === undefined && body.imageUrl === undefined) {
      return NextResponse.json({ error: values.error.flatten() }, { status: 400 });
    }
    const update: {
      name?: string;
      slug?: string;
      nameAr?: string | null;
      isActive?: boolean;
      image?: string | null;
      parentId?: number | null;
      updatedAt: Date;
      updatedBy?: string | null;
      updatedByName?: string | null;
    } = {
      updatedAt: new Date(),
      updatedBy: actor.email ?? null,
      updatedByName: actor.name ?? null,
    };
    if (values.success) {
      if (values.data.name !== undefined) update.name = values.data.name;
      if (values.data.name !== undefined) update.slug = await resolveEntitySlug('categories', values.data.name, numericId);
      if (values.data.nameAr !== undefined) update.nameAr = values.data.nameAr;
      if (values.data.parentId !== undefined) update.parentId = values.data.parentId ?? null;
      if (values.data.status !== undefined) update.isActive = values.data.status === 'active';
      if (values.data.imageUrl !== undefined) update.image = values.data.imageUrl;
    }
    await mutateEntityWithHistory(db, {
      entityType,
      entityId: numericId,
      operation: 'update',
      actor,
      execute: (tx) =>
        tx.update(categories).set(update).where(eq(categories.id, numericId)).catch((error) => {
          if (!isMissingAuditColumnError(error)) {
            throw error;
          }

          return tx
            .update(categories)
            .set({
              name: update.name,
              slug: update.slug,
              nameAr: update.nameAr,
              isActive: update.isActive,
              image: update.image,
              parentId: update.parentId,
              updatedAt: update.updatedAt,
            })
            .where(eq(categories.id, numericId));
        }),
    });
    return NextResponse.json({ ok: true });
  }
  if (entityType === 'assets') {
    // assets only support status toggle via this endpoint, no other fields
    await mutateEntityWithHistory(db, {
      entityType,
      entityId: numericId,
      operation: 'update',
      actor,
      execute: (tx) => tx.update(importBatches).set({ updatedAt: new Date() }).where(eq(importBatches.id, numericId)),
    });
    return NextResponse.json({ ok: true });
  }
  if (entityType === 'brandsCategories') {
    const isCategory = numericId >= 1_000_000_000;
    if (!isCategory) {
      await mutateEntityWithHistory(db, {
        entityType,
        entityId: numericId,
        operation: 'update',
        actor,
        execute: (tx) => tx.update(brands).set({ isActive: body.status === 'active', updatedAt: new Date() }).where(eq(brands.id, numericId)),
      });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Read only entity type' }, { status: 400 });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ entityType: string; id: string }> }) {
  const { entityType, id } = await params;
  const resource = getEntityMutationResource(entityType);

  if (!resource) {
    return NextResponse.json({ error: 'Read only entity type' }, { status: 400 });
  }

  const denied = await requireMutationAccess(resource);
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const numericId = Number(id);
  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };

  if (entityType === 'products') {
    await mutateEntityWithHistory(db, {
      entityType,
      entityId: numericId,
      operation: 'delete',
      actor,
      execute: (tx) => tx.delete(products).where(eq(products.id, numericId)),
    });
    return NextResponse.json({ ok: true });
  }
  if (entityType === 'orders') {
    await mutateEntityWithHistory(db, {
      entityType,
      entityId: numericId,
      operation: 'delete',
      actor,
      execute: (tx) => tx.delete(orders).where(eq(orders.id, numericId)),
    });
    return NextResponse.json({ ok: true });
  }
   if (entityType === 'assets') {
     await mutateEntityWithHistory(db, {
       entityType,
       entityId: numericId,
       operation: 'delete',
       actor,
       execute: (tx) => tx.delete(importBatches).where(eq(importBatches.id, numericId)),
     });
     return NextResponse.json({ ok: true });
   }
   if (entityType === 'brands') {
     await mutateEntityWithHistory(db, {
       entityType,
       entityId: numericId,
       operation: 'delete',
       actor,
       execute: (tx) => tx.delete(brands).where(eq(brands.id, numericId)),
     });
     return NextResponse.json({ ok: true });
   }
   if (entityType === 'categories') {
     await mutateEntityWithHistory(db, {
       entityType,
       entityId: numericId,
       operation: 'delete',
       actor,
       execute: (tx) => tx.delete(categories).where(eq(categories.id, numericId)),
     });
     return NextResponse.json({ ok: true });
   }
   if (entityType === 'brandsCategories') {
     const isCategory = numericId >= 1_000_000_000;
      if (!isCategory) {
        await mutateEntityWithHistory(db, {
          entityType,
          entityId: numericId,
          operation: 'delete',
          actor,
          execute: (tx) => tx.delete(brands).where(eq(brands.id, numericId)),
        });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Read only entity type' }, { status: 400 });
  }
