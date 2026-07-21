import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '../../../db/client';
import { categories } from '../../../db/schema';
import { mutateEntityWithHistory } from '../../../lib/action-history';
import { auth } from '../../../lib/auth';
import { readCategoriesPage, resolveCategorySlug } from '../../../lib/brands-categories-api';
import { categoryFormSchema, paginationQuerySchema } from '../../../lib/brands-categories';
import { requireMutationAccess } from '../../../lib/rbac';
import { captureAdminException, getRequestId, withRequestIdHeaders } from '../../../lib/sentry';
import { revalidateStorefrontProductMeta } from '../../../lib/storefront-revalidate';

function emptyPagination() {
  return {
    page: 1,
    limit: 50,
    totalItems: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  };
}

export async function GET(request: NextRequest) {
  const denied = await requireMutationAccess('brandsCategories');
  if (denied) {
    return denied;
  }

  const query = paginationQuerySchema.parse({
    page: request.nextUrl.searchParams.get('page') ?? undefined,
    limit: request.nextUrl.searchParams.get('limit') ?? undefined,
    search: request.nextUrl.searchParams.get('search') ?? undefined,
  });
  const includeParentOptions = request.nextUrl.searchParams.get('includeParentOptions') === '1';

  if (!hasDb()) {
    return NextResponse.json({ writable: false, items: [], parentOptions: [], pagination: emptyPagination() });
  }

  return NextResponse.json({
    writable: true,
    ...(await readCategoriesPage(query, includeParentOptions)),
  });
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const denied = await requireMutationAccess('brandsCategories');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503, headers: withRequestIdHeaders(requestId) });
  }

  const parsed = categoryFormSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400, headers: withRequestIdHeaders(requestId) });
  }

  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };
  const data = parsed.data;
  try {
    const slug = await resolveCategorySlug(data.name);

    await mutateEntityWithHistory(db, {
      entityType: 'categories',
      operation: 'create',
      actor,
      execute: (tx) =>
        tx
          .insert(categories)
          .values({
            name: data.name,
            slug,
            nameAr: data.nameAr,
            image: data.imageUrl,
            parentId: data.parentId ?? null,
            isActive: true,
            createdBy: actor.email ?? null,
            createdByName: actor.name ?? null,
            updatedBy: actor.email ?? null,
            updatedByName: actor.name ?? null,
          })
          .returning({ id: categories.id }),
      resolveEntityId: (rows) => rows[0]?.id,
    });
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'categories-create',
      route: '/api/categories',
      session,
      context: { name: data.name, parentId: data.parentId ?? null },
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create category' },
      { status: 500, headers: withRequestIdHeaders(requestId) },
    );
  }

  await revalidateStorefrontProductMeta();

  return NextResponse.json({ ok: true }, { headers: withRequestIdHeaders(requestId) });
}
