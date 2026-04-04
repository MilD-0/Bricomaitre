import { NextRequest, NextResponse } from 'next/server';
import { asc, count, desc, ilike, inArray, isNull } from 'drizzle-orm';

import { getDb, hasDb } from '../../../../db/client';
import { brands, categories, importBatches, orders, processedOrders, products } from '../../../../db/schema';
import { brandFormSchema, categoryFormSchema, paginationQuerySchema } from '../../../../lib/brands-categories';
import type { ManagedEntity } from '../../../../lib/entity-types';
import { mutateEntityWithHistory } from '../../../../lib/action-history';
import { entityFormSchema } from '../../../../lib/permissions';
import { auth } from '../../../../lib/auth';
import { coerceOrderStatus, isConfirmedLifecycleStatus } from '../../../../lib/orders';
import { getEntityMutationResource, requireAppAccess, requireMutationAccess, canMutateResource } from '../../../../lib/rbac';
import { resolveUniqueSlug } from '../../../../lib/slug';

async function resolveEntitySlug(
  entityType: 'products' | 'brands' | 'categories',
  value: string,
) {
  const db = getDb() as {
    query?: {
      products?: { findFirst?: (input: unknown) => Promise<{ id: number } | undefined> };
      brands?: { findFirst?: (input: unknown) => Promise<{ id: number } | undefined> };
      categories?: { findFirst?: (input: unknown) => Promise<{ id: number } | undefined> };
    };
  };

  const entityQueries = {
    products: db.query?.products?.findFirst,
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
        helpers: { eq: typeof import('drizzle-orm').eq },
      ) => helpers.eq(table.slug, slug),
    });

    return Boolean(existing);
  });
}

function asManagedEntity(row: { id: number; name: string; updatedAt: Date | null; status?: ManagedEntity['status']; tags?: string[]; image?: string }): ManagedEntity {
  return {
    id: String(row.id),
    name: row.name,
    status: row.status ?? 'active',
    tags: row.tags ?? [],
    updatedAt: (row.updatedAt ?? new Date()).toISOString(),
    image: row.image,
  };
}

function isMissingAuditColumnError(error: unknown) {
  return (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === '42703'
  );
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ entityType: string }> }) {
  const { entityType } = await params;
  const resource = getEntityMutationResource(entityType);
  const denied = resource
    ? await requireMutationAccess(resource)
    : entityType === 'inventory'
      ? await requireMutationAccess('products')
      : await requireAppAccess();

  if (denied) {
    return denied;
  }

  const query = paginationQuerySchema.parse({
    page: _.nextUrl.searchParams.get('page') ?? undefined,
    limit: _.nextUrl.searchParams.get('limit') ?? undefined,
    search: _.nextUrl.searchParams.get('search') ?? undefined,
  });
  const includeParentOptions = _.nextUrl.searchParams.get('includeParentOptions') === '1';
  const session = await auth();
  const writable = resource ? canMutateResource(session?.user?.permissions, resource) : false;

  if (!hasDb()) {
    return NextResponse.json({ writable: false, items: [] });
  }

  if (entityType === 'products') {
    const rows = await getDb().select().from(products).orderBy(desc(products.updatedAt));
    return NextResponse.json({ writable, items: rows.map((r) => asManagedEntity({ id: r.id, name: r.title, updatedAt: r.updatedAt, status: r.inStock ? 'active' : 'draft', tags: [r.sku ?? ''].filter(Boolean) })) });
  }

  if (entityType === 'orders') {
    const rows = await getDb().select().from(orders).where(isNull(orders.archivedAt)).orderBy(desc(orders.updatedAt));
    return NextResponse.json({ writable, items: rows.map((r) => asManagedEntity({ id: r.id, name: [r.firstName, r.lastName].filter(Boolean).join(' ') || r.phoneNumber1, updatedAt: r.updatedAt, status: isConfirmedLifecycleStatus(coerceOrderStatus(r.confirmed)) ? 'active' : 'draft', tags: [r.phoneNumber1] })) });
  }

  if (entityType === 'inventory') {
    const rows = await getDb().select().from(processedOrders).orderBy(desc(processedOrders.updatedAt));
    return NextResponse.json({ writable: false, items: rows.map((r) => asManagedEntity({ id: r.id, name: r.tracking, updatedAt: r.updatedAt, tags: [r.wilaya, r.commune].filter(Boolean) })) });
  }

   if (entityType === 'assets') {
     const rows = await getDb().select().from(importBatches).orderBy(desc(importBatches.updatedAt));
     return NextResponse.json({ writable, items: rows.map((r) => asManagedEntity({ id: r.id, name: r.fileName, updatedAt: r.updatedAt, status: 'active', tags: [r.batchId] })) });
   }

   if (entityType === 'brands') {
     let rows;
     let hasAuditColumns = true;
     const searchFilter = query.search ? ilike(brands.name, `%${query.search}%`) : undefined;
     const [{ value: totalItems }] = await getDb()
       .select({ value: count() })
       .from(brands)
       .where(searchFilter);
     try {
       const baseQuery = getDb().select().from(brands);
       rows = await (searchFilter
         ? baseQuery.where(searchFilter)
         : baseQuery)
         .orderBy(desc(brands.updatedAt))
         .limit(query.limit)
         .offset((query.page - 1) * query.limit);
     } catch (error) {
       if (!isMissingAuditColumnError(error)) {
         throw error;
       }
       hasAuditColumns = false;
       const baseQuery = getDb().select({
         id: brands.id,
         name: brands.name,
         slug: brands.slug,
         image: brands.image,
         featured: brands.featured,
         isActive: brands.isActive,
         createdAt: brands.createdAt,
         updatedAt: brands.updatedAt,
       }).from(brands);
       rows = await (searchFilter
         ? baseQuery.where(searchFilter)
         : baseQuery)
         .orderBy(desc(brands.updatedAt))
         .limit(query.limit)
         .offset((query.page - 1) * query.limit);
     }
     const totalPages = Math.max(1, Math.ceil(totalItems / query.limit));
     const pageRows = rows;
     return NextResponse.json({
       writable,
       items: pageRows.map((r) => ({
         id: String(r.id),
         name: r.name,
         slug: r.slug,
         isActive: r.isActive,
         status: r.isActive ? 'active' : 'draft',
         image: r.image ?? null,
         createdAt: r.createdAt.toISOString(),
         updatedAt: r.updatedAt.toISOString(),
         createdBy: hasAuditColumns && 'createdBy' in r ? r.createdBy ?? null : null,
         createdByName: hasAuditColumns && 'createdByName' in r ? r.createdByName ?? null : null,
         updatedBy: hasAuditColumns && 'updatedBy' in r ? r.updatedBy ?? null : null,
         updatedByName: hasAuditColumns && 'updatedByName' in r ? r.updatedByName ?? null : null,
       })),
       pagination: {
         page: query.page,
         limit: query.limit,
         totalItems,
         totalPages,
         hasNextPage: query.page < totalPages,
         hasPreviousPage: query.page > 1,
       },
     });
   }

   if (entityType === 'categories') {
     let rows;
     let hasAuditColumns = true;
     const searchFilter = query.search ? ilike(categories.name, `%${query.search}%`) : undefined;
     const [{ value: totalItems }] = await getDb()
       .select({ value: count() })
       .from(categories)
       .where(searchFilter);
     try {
       const baseQuery = getDb().select().from(categories);
       rows = await (searchFilter
         ? baseQuery.where(searchFilter)
         : baseQuery)
         .orderBy(desc(categories.updatedAt))
         .limit(query.limit)
         .offset((query.page - 1) * query.limit);
     } catch (error) {
       if (!isMissingAuditColumnError(error)) {
         throw error;
       }
       hasAuditColumns = false;
       const baseQuery = getDb().select({
         id: categories.id,
         name: categories.name,
         slug: categories.slug,
         nameAr: categories.nameAr,
         image: categories.image,
         parentId: categories.parentId,
         featured: categories.featured,
         isActive: categories.isActive,
         createdAt: categories.createdAt,
         updatedAt: categories.updatedAt,
       }).from(categories);
       rows = await (searchFilter
         ? baseQuery.where(searchFilter)
         : baseQuery)
         .orderBy(desc(categories.updatedAt))
         .limit(query.limit)
         .offset((query.page - 1) * query.limit);
     }
     const totalPages = Math.max(1, Math.ceil(totalItems / query.limit));
     const pageRows = rows;
     const parentIds = [...new Set(pageRows.map((row) => row.parentId).filter((value): value is number => typeof value === 'number'))];
     const parentRows = parentIds.length === 0
       ? []
       : await getDb()
         .select({ id: categories.id, name: categories.name })
         .from(categories)
         .where(inArray(categories.id, parentIds));
     const categoryNames = new Map(parentRows.map((row) => [row.id, row.name]));
     const parentOptions = includeParentOptions
       ? await getDb()
         .select({ id: categories.id, name: categories.name })
         .from(categories)
         .orderBy(asc(categories.name))
       : [];
     return NextResponse.json({
       writable,
       items: pageRows.map((r) => ({
         id: String(r.id),
         name: r.name,
         slug: r.slug,
         nameAr: 'nameAr' in r ? r.nameAr ?? null : null,
         image: r.image ?? null,
         isActive: r.isActive,
         status: r.isActive ? 'active' : 'draft',
         parentId: r.parentId ? String(r.parentId) : null,
         parentName: r.parentId ? categoryNames.get(r.parentId) ?? null : null,
         createdAt: r.createdAt.toISOString(),
         updatedAt: r.updatedAt.toISOString(),
         createdBy: hasAuditColumns && 'createdBy' in r ? r.createdBy ?? null : null,
         createdByName: hasAuditColumns && 'createdByName' in r ? r.createdByName ?? null : null,
         updatedBy: hasAuditColumns && 'updatedBy' in r ? r.updatedBy ?? null : null,
         updatedByName: hasAuditColumns && 'updatedByName' in r ? r.updatedByName ?? null : null,
       })),
       parentOptions: parentOptions.map((row) => ({ id: String(row.id), name: row.name })),
       pagination: {
         page: query.page,
         limit: query.limit,
         totalItems,
         totalPages,
         hasNextPage: query.page < totalPages,
         hasPreviousPage: query.page > 1,
       },
     });
   }

    if (entityType === 'brandsCategories') {
     const [brandRows, categoryRows] = await Promise.all([
       getDb().select().from(brands).orderBy(desc(brands.updatedAt)).limit(100),
       getDb().select().from(categories).orderBy(desc(categories.updatedAt)).limit(100),
     ]);
     const items = [
       ...brandRows.map((r) => asManagedEntity({ id: r.id, name: `Brand: ${r.name}`, updatedAt: r.updatedAt, status: r.isActive ? 'active' : 'draft', tags: ['brand'] })),
       ...categoryRows.map((r) => asManagedEntity({ id: r.id + 1_000_000_000, name: `Category: ${r.name}`, updatedAt: r.updatedAt, status: r.isActive ? 'active' : 'draft', tags: ['category'] })),
     ];
     return NextResponse.json({ writable, items });
   }

   if (entityType === 'bulletin') {
     return NextResponse.json({ writable: false, items: [] });
   }

  return NextResponse.json({ error: 'Unsupported entity type' }, { status: 400 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ entityType: string }> }) {
  const { entityType } = await params;
  const resource = getEntityMutationResource(entityType);

  if (!resource) {
    return NextResponse.json({ error: 'Read only entity type' }, { status: 400 });
  }

  const denied = await requireMutationAccess(resource);
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ writable: false, items: [] });
  }

  const rawBody = await req.json();
  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };

  if (entityType === 'products') {
    const parsed = entityFormSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const body = parsed.data;
    const tags = body.tags?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? [];
    const slug = await resolveEntitySlug('products', body.name);
    await mutateEntityWithHistory(db, {
      entityType,
      operation: 'create',
      actor,
      execute: (tx) => tx.insert(products).values({
        title: body.name,
        slug,
        price: '0',
        active: body.status === 'active',
        inStock: body.status === 'active',
        sku: tags[0] ?? null,
      }).returning({ id: products.id }),
      resolveEntityId: (rows) => rows[0]?.id,
    });
    return NextResponse.json({ ok: true });
  }
  if (entityType === 'orders') {
    const parsed = entityFormSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const body = parsed.data;
    const tags = body.tags?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? [];
    await mutateEntityWithHistory(db, {
      entityType,
      operation: 'create',
      actor,
      execute: (tx) => tx.insert(orders).values({
        phoneNumber1: body.name,
        confirmed: body.status === 'active' ? 2 : 0,
        noAnswerCount: 0,
        cartProducts: tags,
      }).returning({ id: orders.id }),
      resolveEntityId: (rows) => rows[0]?.id,
    });
    return NextResponse.json({ ok: true });
  }
   if (entityType === 'assets') {
     const parsed = entityFormSchema.safeParse(rawBody);
     if (!parsed.success) {
       return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
     }
     const body = parsed.data;
     const tags = body.tags?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? [];
     await mutateEntityWithHistory(db, {
       entityType,
       operation: 'create',
       actor,
       execute: (tx) => tx.insert(importBatches).values({
         batchId: crypto.randomUUID(),
         fileName: body.name,
         unmatchedReferences: tags,
       }).returning({ id: importBatches.id }),
       resolveEntityId: (rows) => rows[0]?.id,
     });
     return NextResponse.json({ ok: true });
   }

   if (entityType === 'brands') {
     const parsed = brandFormSchema.safeParse(rawBody);
     if (!parsed.success) {
       return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
     }
     const body = parsed.data;
     const slug = await resolveEntitySlug('brands', body.name);
     await mutateEntityWithHistory(db, {
       entityType,
       operation: 'create',
       actor,
       execute: (tx) =>
         tx
           .insert(brands)
           .values({
             name: body.name,
             slug,
             isActive: true,
             image: body.imageUrl,
             createdBy: actor.email ?? null,
             createdByName: actor.name ?? null,
             updatedBy: actor.email ?? null,
             updatedByName: actor.name ?? null,
           })
           .returning({ id: brands.id })
           .catch((error) => {
             if (!isMissingAuditColumnError(error)) {
               throw error;
             }

             return tx
               .insert(brands)
               .values({
                name: body.name,
                slug,
                isActive: true,
                 image: body.imageUrl,
               })
               .returning({ id: brands.id });
           }),
       resolveEntityId: (rows) => rows[0]?.id,
     });
     return NextResponse.json({ ok: true });
   }

   if (entityType === 'categories') {
     const parsed = categoryFormSchema.safeParse(rawBody);
     if (!parsed.success) {
       return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
     }
     const body = parsed.data;
     const slug = await resolveEntitySlug('categories', body.name);
     await mutateEntityWithHistory(db, {
       entityType,
       operation: 'create',
       actor,
       execute: (tx) =>
         tx
           .insert(categories)
           .values({
             name: body.name,
             slug,
             nameAr: body.nameAr,
             isActive: true,
             image: body.imageUrl,
             parentId: body.parentId ?? null,
             createdBy: actor.email ?? null,
             createdByName: actor.name ?? null,
             updatedBy: actor.email ?? null,
             updatedByName: actor.name ?? null,
           })
           .returning({ id: categories.id })
           .catch((error) => {
             if (!isMissingAuditColumnError(error)) {
               throw error;
             }

             return tx
               .insert(categories)
               .values({
                name: body.name,
                slug,
                nameAr: body.nameAr,
                 isActive: true,
                 image: body.imageUrl,
                 parentId: body.parentId ?? null,
               })
               .returning({ id: categories.id });
           }),
       resolveEntityId: (rows) => rows[0]?.id,
     });
     return NextResponse.json({ ok: true });
   }

    if (entityType === 'brandsCategories') {
     const parsed = entityFormSchema.safeParse(rawBody);
     if (!parsed.success) {
       return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
     }
     const body = parsed.data;
     const slug = await resolveEntitySlug('brands', body.name);
     await mutateEntityWithHistory(db, {
       entityType,
       operation: 'create',
       actor,
       execute: (tx) => tx.insert(brands).values({
         name: body.name,
         slug,
         featured: body.status === 'active',
         isActive: body.status === 'active',
       }).returning({ id: brands.id }),
       resolveEntityId: (rows) => rows[0]?.id,
     });
     return NextResponse.json({ ok: true });
   }

   return NextResponse.json({ error: 'Read only entity type' }, { status: 400 });
 }
