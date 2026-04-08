import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '../../../db/client';
import { brands } from '../../../db/schema';
import { mutateEntityWithHistory } from '../../../lib/action-history';
import { auth } from '../../../lib/auth';
import { readBrandsPage, resolveBrandSlug } from '../../../lib/brands-categories-api';
import { brandFormSchema, paginationQuerySchema } from '../../../lib/brands-categories';
import { requireMutationAccess } from '../../../lib/rbac';

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

  if (!hasDb()) {
    return NextResponse.json({ writable: false, items: [], pagination: emptyPagination() });
  }

  return NextResponse.json({
    writable: true,
    ...(await readBrandsPage(query)),
  });
}

export async function POST(req: NextRequest) {
  const denied = await requireMutationAccess('brandsCategories');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const parsed = brandFormSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };
  const data = parsed.data;
  const slug = await resolveBrandSlug(data.name);

  await mutateEntityWithHistory(db, {
    entityType: 'brands',
    operation: 'create',
    actor,
    execute: (tx) =>
      tx
        .insert(brands)
        .values({
          name: data.name,
          slug,
          isActive: true,
          image: data.imageUrl,
          createdBy: actor.email ?? null,
          createdByName: actor.name ?? null,
          updatedBy: actor.email ?? null,
          updatedByName: actor.name ?? null,
        })
        .returning({ id: brands.id }),
    resolveEntityId: (rows) => rows[0]?.id,
  });

  return NextResponse.json({ ok: true });
}
