import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '../../../db/client';
import { categories } from '../../../db/schema';
import { mutateEntityWithHistory } from '../../../lib/action-history';
import { auth } from '../../../lib/auth';
import { readCategoriesPage, resolveCategorySlug } from '../../../lib/brands-categories-api';
import { categoryFormSchema, paginationQuerySchema } from '../../../lib/brands-categories';
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
  const denied = await requireMutationAccess('brandsCategories');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const parsed = categoryFormSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };
  const data = parsed.data;
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

  return NextResponse.json({ ok: true });
}
