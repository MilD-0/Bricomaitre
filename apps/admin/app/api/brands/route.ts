import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readBrandsPage } from '@/lib/brands-categories-api';
import { brandFormSchema, taxonomyListQuerySchema } from '@/lib/brands-categories';
import { requireMutationAccess } from '@/lib/rbac';
import { captureAdminException, getRequestId, withRequestIdHeaders } from '@/lib/sentry';
import { revalidateStorefrontProductMeta } from '@/lib/storefront-revalidate';
import { createBrandThroughCanonicalWorkflow } from '@/lib/taxonomy-mutations';

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
  const { response: denied } = await requireMutationAccess('brandsCategories');
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

  if (!hasDb()) {
    return NextResponse.json({ writable: false, items: [], pagination: emptyPagination() });
  }

  return NextResponse.json({
    writable: true,
    ...(await readBrandsPage(query)),
  });
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const { response: denied, session } = await requireMutationAccess('brandsCategories');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json(
      { error: 'DATABASE_URL is not configured' },
      { status: 503, headers: withRequestIdHeaders(requestId) },
    );
  }

  const parsed = brandFormSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400, headers: withRequestIdHeaders(requestId) },
    );
  }

  const db = getDb();

  const actor = { email: session?.user?.email, name: session?.user?.name };
  const data = parsed.data;
  try {
    await createBrandThroughCanonicalWorkflow(db, data, actor);
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'brands-create',
      route: '/api/brands',
      session,
      context: { name: data.name },
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create brand' },
      { status: 500, headers: withRequestIdHeaders(requestId) },
    );
  }

  await revalidateStorefrontProductMeta();

  return NextResponse.json({ ok: true }, { headers: withRequestIdHeaders(requestId) });
}
