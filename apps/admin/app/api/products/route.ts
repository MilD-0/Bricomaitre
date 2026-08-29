import { NextRequest, NextResponse } from 'next/server';
import { and, asc, count, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';

import { getDb, hasDb } from '@bric/db/client';
import { orders, products } from '@bric/db/schema';
import { CONFIRMED_LIFECYCLE_ORDER_STATUSES } from '@bric/storefront-core/order-domain';
import { auth } from '../../../lib/auth';
import { startProductCatalogFeedRefreshJob } from '../../../lib/background-jobs';
import { productListQuerySchema, productPayloadSchema } from '../../../lib/products';
import {
  createProductThroughCanonicalWorkflow,
  ProductIntegrityConflictError,
} from '../../../lib/product-update-workflow';
import { requireMutationAccess } from '../../../lib/rbac';
import { captureAdminException, getRequestId } from '../../../lib/sentry';
import { CACHE_TAGS, createServerCache, revalidateServerTags } from '../../../lib/server-cache';
import { revalidateStorefrontProducts } from '../../../lib/storefront-revalidate';

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
  const ownedImagePredicate =
    ownedClauses.length > 0 ? sql.join(ownedClauses, sql` OR `) : sql`false`;

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

async function getProductOrderMetrics(
  rows: Array<{ id: number; mongoId?: string | null }>,
): Promise<Map<number, ProductMetricRow>> {
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
  const referenceValues = sql.join(
    references.map((reference) => sql`${reference}`),
    sql`, `,
  );
  const result = await getDb().execute(sql`
    with selected_products(id, mongo_id) as (
      values ${selectedProductValues}
    ),
    matched_orders as (
      select distinct
        sp.id as product_id,
        ${orders.id} as order_id,
        ${orders.inHouseStatus} as confirmed
      from ${orders}
      inner join selected_products sp
        on sp.id::text = any(${orders.cartProducts})
        or (sp.mongo_id is not null and sp.mongo_id = any(${orders.cartProducts}))
      where ${orders.cartProducts} && array[${referenceValues}]::text[]
    )
    select
      product_id::bigint as "productId",
      count(*)::int as "orderPurchaseCount",
      count(*) filter (where confirmed in (${sql.join(
        CONFIRMED_LIFECYCLE_ORDER_STATUSES.map((status) => sql`${status}`),
        sql`, `,
      )}))::int as "confirmedOrderCount"
    from matched_orders
    group by product_id
  `);

  return new Map(
    (result.rows ?? []).map((row: unknown) => {
      const typedRow = row as Record<string, unknown>;
      const productId = Number(typedRow.productId);

      return [
        productId,
        {
          productId,
          orderPurchaseCount: Number(typedRow.orderPurchaseCount ?? 0),
          confirmedOrderCount: Number(typedRow.confirmedOrderCount ?? 0),
        },
      ];
    }),
  );
}

async function addOrderMetricsToProducts<T extends { id: number; mongoId?: string | null }>(
  rows: T[],
) {
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
      confirmationRate:
        metrics.orderPurchaseCount > 0
          ? roundRate((metrics.confirmedOrderCount / metrics.orderPurchaseCount) * 100)
          : null,
    };
  });
}

async function loadAllProducts() {
  return getDb()
    .select()
    .from(products)
    .where(isNull(products.archivedAt))
    .orderBy(desc(products.updatedAt));
}

async function loadPaginatedProducts(query: ProductListQuery) {
  const db = getDb();
  const filters = [
    isNull(products.archivedAt),
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
    query.state === 'active'
      ? eq(products.active, true)
      : query.state === 'inactive'
        ? eq(products.active, false)
        : query.state === 'out'
          ? eq(products.inStock, false)
          : undefined,
  ].filter((value) => value !== undefined);
  const whereClause = filters.length > 0 ? and(...filters) : undefined;

  const [{ value: totalItems }] = await db
    .select({ value: count() })
    .from(products)
    .where(whereClause);
  const totalPages = Math.max(1, Math.ceil(totalItems / query.limit));
  const page = Math.min(query.page, totalPages);
  const orderBy = query.sortRules.flatMap((rule) => {
    const direction = rule.direction === 'asc' ? asc : desc;

    return [
      {
        active: direction(products.active),
        title: direction(products.title),
        price: direction(products.price),
        purchasePrice: direction(products.purchasePrice),
        inStock: direction(products.inStock),
        updatedAt: direction(products.updatedAt),
        createdAt: direction(products.createdAt),
      }[rule.key],
    ];
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

const getCachedAllProducts = createServerCache({
  keyParts: ['admin-products-all'],
  revalidate: 300,
  tags: [CACHE_TAGS.products],
  load: loadAllProducts,
});
const getCachedPaginatedProducts = createServerCache({
  keyParts: ['admin-products-page'],
  revalidate: 300,
  tags: [CACHE_TAGS.products],
  load: loadPaginatedProducts,
});

export async function GET(req: NextRequest) {
  const denied = await requireMutationAccess('products');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ items: [] });
  }

  const searchParams = req.nextUrl.searchParams;
  const shouldPaginate = [
    'page',
    'limit',
    'search',
    'brandId',
    'categoryId',
    'imageOrigin',
    'state',
    'sort',
    'sortKey',
    'sortDirection',
  ].some((key) => searchParams.has(key));

  if (!shouldPaginate) {
    const rows = await getCachedAllProducts();
    return NextResponse.json({ items: rows });
  }

  const parsed = productListQuerySchema.safeParse({
    page: searchParams?.get('page') ?? undefined,
    limit: searchParams?.get('limit') ?? undefined,
    search: searchParams?.get('search') ?? undefined,
    brandId: searchParams?.get('brandId'),
    categoryId: searchParams?.get('categoryId'),
    imageOrigin: searchParams?.get('imageOrigin') ?? undefined,
    state: searchParams?.get('state') ?? undefined,
    sort: searchParams.getAll('sort'),
    sortKey: searchParams?.get('sortKey') ?? undefined,
    sortDirection: searchParams?.get('sortDirection') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const query = parsed.data;

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

  const parsed = productPayloadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };

  try {
    await createProductThroughCanonicalWorkflow(db, parsed.data, actor);
  } catch (error) {
    if (error instanceof ProductIntegrityConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  revalidateServerTags(CACHE_TAGS.products, CACHE_TAGS.productsMeta);
  await revalidateStorefrontProducts();

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
