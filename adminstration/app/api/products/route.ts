import { NextRequest, NextResponse } from 'next/server';
import { and, asc, count, desc, eq, ilike, or, sql } from 'drizzle-orm';

import { getDb, hasDb } from '../../../db/client';
import { products } from '../../../db/schema';
import { mutateEntityWithHistory } from '../../../lib/action-history';
import { auth } from '../../../lib/auth';
import { productListQuerySchema, productPayloadSchema } from '../../../lib/products';
import { requireMutationAccess } from '../../../lib/rbac';
import { applyServerCache, CACHE_TAGS, revalidateServerTags } from '../../../lib/server-cache';
import { resolveUniqueSlug } from '../../../lib/slug';

async function resolveProductSlug(
  data: ReturnType<typeof productPayloadSchema.parse>,
  currentId?: number,
) {
  const db = getDb() as {
    query?: {
      products?: {
        findFirst?: (input: unknown) => Promise<{ id: number } | undefined>;
      };
    };
  };

  if (!db.query?.products?.findFirst) {
    return resolveUniqueSlug(data.slug ?? data.title, async () => false);
  }

  return resolveUniqueSlug(data.slug ?? data.title, async (slug) => {
    const existing = await db.query?.products?.findFirst?.({
      columns: { id: true },
      where: (
        productsTable: typeof products,
        helpers: { and: typeof import('drizzle-orm').and; eq: typeof import('drizzle-orm').eq; ne: typeof import('drizzle-orm').ne },
      ) => (
        currentId == null
          ? helpers.eq(productsTable.slug, slug)
          : helpers.and(
            helpers.eq(productsTable.slug, slug),
            helpers.ne(productsTable.id, currentId),
          )
      ),
    });

    return Boolean(existing);
  });
}

async function toProductMutationValues(
  data: ReturnType<typeof productPayloadSchema.parse>,
  currentId?: number,
) {
  return {
    ...data,
    slug: await resolveProductSlug(data, currentId),
    price: data.price.toFixed(2),
    oldPrice: data.oldPrice == null ? null : data.oldPrice.toFixed(2),
    purchasePrice: data.purchasePrice == null ? null : data.purchasePrice.toFixed(2),
  };
}

type ProductListQuery = ReturnType<typeof productListQuerySchema.parse>;

function normalizeHostname(value: string | undefined) {
  return String(value ?? '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function buildOwnedImageUrlPrefixes() {
  const bucket = String(process.env.AWS_S3_BUCKET ?? '').trim();
  const region = String(process.env.AWS_REGION ?? '').trim();
  const cloudfrontHost = normalizeHostname(process.env.AWS_CLOUDFRONT_DOMAIN);
  const prefixes = new Set<string>();

  if (cloudfrontHost) {
    prefixes.add(`https://${cloudfrontHost}/%`);
    prefixes.add(`http://${cloudfrontHost}/%`);
  }

  if (bucket) {
    if (region) {
      prefixes.add(`https://${bucket}.s3.${region}.amazonaws.com/%`);
      prefixes.add(`http://${bucket}.s3.${region}.amazonaws.com/%`);
      prefixes.add(`https://s3.${region}.amazonaws.com/${bucket}/%`);
      prefixes.add(`http://s3.${region}.amazonaws.com/${bucket}/%`);
    }

    prefixes.add(`https://${bucket}.s3.amazonaws.com/%`);
    prefixes.add(`http://${bucket}.s3.amazonaws.com/%`);
    prefixes.add(`https://s3.amazonaws.com/${bucket}/%`);
    prefixes.add(`http://s3.amazonaws.com/${bucket}/%`);
  }

  return [...prefixes];
}

function buildExternalImageWhereClause() {
  const imageUrl = sql.raw('image_url');
  const ownedPatterns = buildOwnedImageUrlPrefixes();
  const ownedClauses = ownedPatterns.map((pattern) => sql`${imageUrl} ILIKE ${pattern}`);
  const ownedImagePredicate = ownedClauses.length > 0
    ? sql.join(ownedClauses, sql` OR `)
    : sql`false`;

  return sql`exists (
    select 1
    from unnest(coalesce(${products.images}, ARRAY[]::text[])) as image_rows(image_url)
    where nullif(btrim(${imageUrl}), '') is not null
      and not (${ownedImagePredicate})
  )`;
}

async function getCachedAllProducts() {
  applyServerCache({ stale: 60, revalidate: 300, expire: 3600 }, CACHE_TAGS.products);

  return getDb().select().from(products).orderBy(desc(products.updatedAt));
}

async function getCachedPaginatedProducts(query: ProductListQuery) {
  applyServerCache({ stale: 60, revalidate: 300, expire: 3600 }, CACHE_TAGS.products);

  const db = getDb();
  const filters = [
    query.search
      ? or(
        ilike(products.title, `%${query.search}%`),
        ilike(products.sku, `%${query.search}%`),
        ilike(products.barcode, `%${query.search}%`),
      )
      : undefined,
    query.brandId === null ? undefined : eq(products.brandId, query.brandId),
    query.categoryId === null ? undefined : eq(products.categoryId, query.categoryId),
    query.imageOrigin === 'external' ? buildExternalImageWhereClause() : undefined,
  ].filter((value) => value !== undefined);
  const whereClause = filters.length > 0 ? and(...filters) : undefined;

  const [{ value: totalItems }] = await db.select({ value: count() }).from(products).where(whereClause);
  const totalPages = Math.max(1, Math.ceil(totalItems / query.limit));
  const page = Math.min(query.page, totalPages);
  const direction = query.sortDirection === 'asc' ? asc : desc;
  const orderBy = {
    active: direction(products.active),
    title: direction(products.title),
    price: direction(products.price),
    purchasePrice: direction(products.purchasePrice),
    inStock: direction(products.inStock),
    updatedAt: direction(products.updatedAt),
    createdAt: direction(products.createdAt),
  }[query.sortKey];

  const rows = await db
    .select()
    .from(products)
    .where(whereClause)
    .orderBy(orderBy)
    .limit(query.limit)
    .offset((page - 1) * query.limit);

  return {
    items: rows,
    pagination: {
      page,
      limit: query.limit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

export async function GET(req: NextRequest) {
  const denied = await requireMutationAccess('products');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ items: [] });
  }

  const searchParams = req.nextUrl.searchParams;
  const shouldPaginate = ['page', 'limit', 'search', 'brandId', 'categoryId', 'imageOrigin', 'sortKey', 'sortDirection']
    .some((key) => searchParams.has(key));

  if (!shouldPaginate) {
    const rows = await getCachedAllProducts();
    return NextResponse.json({ items: rows });
  }

  const query = productListQuerySchema.parse({
    page: searchParams?.get('page') ?? undefined,
    limit: searchParams?.get('limit') ?? undefined,
    search: searchParams?.get('search') ?? undefined,
    brandId: searchParams?.get('brandId'),
    categoryId: searchParams?.get('categoryId'),
    imageOrigin: searchParams?.get('imageOrigin') ?? undefined,
    sortKey: searchParams?.get('sortKey') ?? undefined,
    sortDirection: searchParams?.get('sortDirection') ?? undefined,
  });

  return NextResponse.json(await getCachedPaginatedProducts(query));
}

export async function POST(req: NextRequest) {
  const denied = await requireMutationAccess('products');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const parsed = productPayloadSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };
  const values = await toProductMutationValues(data);

  await mutateEntityWithHistory(db, {
    entityType: 'products',
    operation: 'create',
    actor,
    execute: (tx) => tx.insert(products).values(values).returning({ id: products.id }),
    resolveEntityId: (rows) => rows[0]?.id,
  });

  revalidateServerTags(CACHE_TAGS.products, CACHE_TAGS.productsMeta);

  return NextResponse.json({ ok: true });
}
