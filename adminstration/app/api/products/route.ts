import { NextRequest, NextResponse } from 'next/server';
import { and, asc, count, desc, eq, ilike, or, sql } from 'drizzle-orm';

import { getDb, hasDb } from '../../../db/client';
import { orders, productPromoCodes, products } from '../../../db/schema';
import { mutateEntityWithHistory } from '../../../lib/action-history';
import { auth } from '../../../lib/auth';
import { startProductCatalogFeedRefreshJob } from '../../../lib/background-jobs';
import { normalizePromoCode, productListQuerySchema, productPayloadSchema, type ProductPromoCodePayload } from '../../../lib/products';
import { requireMutationAccess } from '../../../lib/rbac';
import { captureAdminException, getRequestId } from '../../../lib/sentry';
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
  const { promoCodes: _promoCodes, ...productValues } = data;
  return {
    ...productValues,
    slug: await resolveProductSlug(data, currentId),
    price: data.price.toFixed(2),
    oldPrice: data.oldPrice == null ? null : data.oldPrice.toFixed(2),
    purchasePrice: data.purchasePrice == null ? null : data.purchasePrice.toFixed(2),
  };
}

function toPromoDate(value: string | null) {
  return value === null ? null : new Date(value);
}

function toProductPromoRows(productId: number, promoCodes: ProductPromoCodePayload[]) {
  const now = new Date();

  return promoCodes.map((promo) => ({
    productId,
    code: promo.code,
    normalizedCode: normalizePromoCode(promo.code),
    promoPrice: promo.promoPrice.toFixed(2),
    active: promo.active,
    startsAt: toPromoDate(promo.startsAt),
    endsAt: toPromoDate(promo.endsAt),
    createdAt: now,
    updatedAt: now,
  }));
}

type ProductListQuery = ReturnType<typeof productListQuerySchema.parse>;
type ProductMetricRow = {
  productId: number;
  orderPurchaseCount: number;
  confirmedOrderCount: number;
};

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

function roundRate(value: number) {
  return Math.round(value * 10) / 10;
}

function withDefaultOrderMetrics<T extends { id: number }>(row: T) {
  return {
    ...row,
    orderPurchaseCount: 0,
    confirmedOrderCount: 0,
    confirmationRate: null,
  };
}

function buildProductReferenceArray(rows: Array<{ id: number; mongoId?: string | null }>) {
  const references = new Set<string>();

  for (const row of rows) {
    references.add(String(row.id));

    const mongoId = row.mongoId?.trim();
    if (mongoId) {
      references.add(mongoId);
    }
  }

  return [...references];
}

async function getProductOrderMetrics(rows: Array<{ id: number; mongoId?: string | null }>): Promise<Map<number, ProductMetricRow>> {
  if (rows.length === 0) {
    return new Map();
  }

  const references = buildProductReferenceArray(rows);
  if (references.length === 0) {
    return new Map();
  }

  const selectedProductValues = sql.join(
    rows.map((row) => sql`(${row.id}::bigint, ${row.mongoId ?? null}::text)`),
    sql`, `,
  );
  const referenceValues = sql.join(references.map((reference) => sql`${reference}`), sql`, `);
  const result = await getDb().execute(sql`
    with selected_products(id, mongo_id) as (
      values ${selectedProductValues}
    ),
    matched_orders as (
      select distinct
        sp.id as product_id,
        ${orders.id} as order_id,
        ${orders.confirmed} as confirmed
      from ${orders}
      inner join selected_products sp
        on sp.id::text = any(${orders.cartProducts})
        or (sp.mongo_id is not null and sp.mongo_id = any(${orders.cartProducts}))
      where ${orders.cartProducts} && array[${referenceValues}]::text[]
    )
    select
      product_id::bigint as "productId",
      count(*)::int as "orderPurchaseCount",
      count(*) filter (where confirmed in (2, 3, 4, 5, 7, 8, 9, 10, 11))::int as "confirmedOrderCount"
    from matched_orders
    group by product_id
  `);

  return new Map((result.rows ?? []).map((row: unknown) => {
    const typedRow = row as Record<string, unknown>;
    const productId = Number(typedRow.productId);

    return [productId, {
      productId,
      orderPurchaseCount: Number(typedRow.orderPurchaseCount ?? 0),
      confirmedOrderCount: Number(typedRow.confirmedOrderCount ?? 0),
    }];
  }));
}

async function addOrderMetricsToProducts<T extends { id: number; mongoId?: string | null }>(rows: T[]) {
  const metricsByProductId = await getProductOrderMetrics(rows);

  return rows.map((row) => {
    const metrics = metricsByProductId.get(row.id);
    if (!metrics) {
      return withDefaultOrderMetrics(row);
    }

    return {
      ...row,
      orderPurchaseCount: metrics.orderPurchaseCount,
      confirmedOrderCount: metrics.confirmedOrderCount,
      confirmationRate: metrics.orderPurchaseCount > 0
        ? roundRate((metrics.confirmedOrderCount / metrics.orderPurchaseCount) * 100)
        : null,
    };
  });
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
  const orderBy = query.sortRules.flatMap((rule) => {
    const direction = rule.direction === 'asc' ? asc : desc;

    return [{
      active: direction(products.active),
      title: direction(products.title),
      price: direction(products.price),
      purchasePrice: direction(products.purchasePrice),
      inStock: direction(products.inStock),
      updatedAt: direction(products.updatedAt),
      createdAt: direction(products.createdAt),
    }[rule.key]];
  });

  const rows = await db
    .select()
    .from(products)
    .where(whereClause)
    .orderBy(...orderBy, desc(products.id))
    .limit(query.limit)
    .offset((page - 1) * query.limit);
  const items = await addOrderMetricsToProducts(rows);

  return {
    items,
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
  const shouldPaginate = ['page', 'limit', 'search', 'brandId', 'categoryId', 'imageOrigin', 'sort', 'sortKey', 'sortDirection']
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
    sort: searchParams.getAll('sort'),
    sortKey: searchParams?.get('sortKey') ?? undefined,
    sortDirection: searchParams?.get('sortDirection') ?? undefined,
  });

  return NextResponse.json(await getCachedPaginatedProducts(query));
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
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
    execute: async (tx) => {
      const rows = await tx.insert(products).values(values).returning({ id: products.id });
      const productId = rows[0]?.id;
      const promoCodes = data.promoCodes ?? [];
      if (productId && promoCodes.length > 0) {
        await tx.insert(productPromoCodes).values(toProductPromoRows(productId, promoCodes));
      }
      return rows;
    },
    resolveEntityId: (rows) => rows[0]?.id,
  });

  revalidateServerTags(CACHE_TAGS.products, CACHE_TAGS.productsMeta);

  try {
    await startProductCatalogFeedRefreshJob('product:create', requestId);
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'product-catalog-feed-enqueue',
      route: '/api/products',
      session,
      context: { trigger: 'product:create' },
    });
  }

  return NextResponse.json({ ok: true });
}
