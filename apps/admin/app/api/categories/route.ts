import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { auth } from '../../../lib/auth';
import { readCategoriesPage } from '../../../lib/brands-categories-api';
import { categoryFormSchema, taxonomyListQuerySchema } from '../../../lib/brands-categories';
import { CategoryHierarchyError } from '../../../lib/category-hierarchy';
import { requireMutationAccess } from '../../../lib/rbac';
import { captureAdminException, getRequestId, withRequestIdHeaders } from '../../../lib/sentry';
import { revalidateStorefrontProductMeta } from '../../../lib/storefront-revalidate';
import { createCategoryThroughCanonicalWorkflow } from '../../../lib/taxonomy-mutations';

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

  const parsed = taxonomyListQuerySchema.safeParse({
    page: request.nextUrl.searchParams.get('page') ?? undefined,
    limit: request.nextUrl.searchParams.get('limit') ?? undefined,
    search: request.nextUrl.searchParams.get('search') ?? undefined,
    sort: request.nextUrl.searchParams.get('sort') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const query = parsed.data;
  const includeParentOptions = request.nextUrl.searchParams.get('includeParentOptions') === '1';

  if (!hasDb()) {
    return NextResponse.json({
      writable: false,
      items: [],
      parentOptions: [],
      pagination: emptyPagination(),
    });
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
    return NextResponse.json(
      { error: 'DATABASE_URL is not configured' },
      { status: 503, headers: withRequestIdHeaders(requestId) },
    );
  }

  const parsed = categoryFormSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400, headers: withRequestIdHeaders(requestId) },
    );
  }

  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };
  const data = parsed.data;
  try {
    await createCategoryThroughCanonicalWorkflow(db, data, actor);
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
      {
        status: error instanceof CategoryHierarchyError ? 409 : 500,
        headers: withRequestIdHeaders(requestId),
      },
    );
  }

  await revalidateStorefrontProductMeta();

  return NextResponse.json({ ok: true }, { headers: withRequestIdHeaders(requestId) });
}
