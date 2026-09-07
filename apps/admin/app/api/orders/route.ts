import { z } from 'zod';
import { AdminMutationIdempotencyConflictError } from '@/lib/admin-mutation-idempotency';
import { NextRequest, NextResponse } from 'next/server';
import { getDb, hasDb } from '@bric/db/client';
import { storefrontOrderCreateSchema } from '@bric/storefront-core/order-domain';
import { loadOrdersPageData } from '@/lib/admin-orders-data';
import { createAdminOrder } from '@/lib/admin-order-lifecycle';
import { orderListQuerySchema } from '@/lib/orders';
import { OrderSearchTimeoutError } from '@/lib/order-search';
import { getRequestSearchParams } from '@/lib/request';
import { canMutateResource, requireMutationAccess } from '@/lib/rbac';

export async function GET(req: NextRequest) {
  const { response: denied, session } = await requireMutationAccess('orders');
  if (denied) {
    return denied;
  }

  const writable = canMutateResource(session?.user?.permissions, 'orders');

  if (!hasDb()) {
    return NextResponse.json({
      writable: false,
      items: [],
      pagination: {
        page: 1,
        limit: 25,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
  }

  const searchParams = getRequestSearchParams(req);
  const queryInput = {
    page: searchParams.get('page') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
    search: searchParams.get('search') ?? undefined,
    inHouseStatus: searchParams.get('inHouseStatus')
      ? Number(searchParams.get('inHouseStatus'))
      : undefined,
    noAnswerCount: searchParams.get('noAnswerCount')
      ? Number(searchParams.get('noAnswerCount'))
      : undefined,
    noAnswerCountMin: searchParams.get('noAnswerCountMin')
      ? Number(searchParams.get('noAnswerCountMin'))
      : undefined,
    sort: searchParams.getAll('sort'),
    sortKey: searchParams.get('sortKey') ?? undefined,
    sortDirection: searchParams.get('sortDirection') ?? undefined,
  };
  const parsed = orderListQuerySchema.safeParse(queryInput);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    return NextResponse.json(await loadOrdersPageData(parsed.data, writable));
  } catch (error) {
    if (error instanceof OrderSearchTimeoutError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }
}

export async function POST(req: NextRequest) {
  const { response: denied, session } = await requireMutationAccess('orders');
  if (denied) return denied;
  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const parsed = storefrontOrderCreateSchema
    .extend({ requestId: z.string().uuid().optional() })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();

  const actor = { email: session?.user?.email, name: session?.user?.name };
  try {
    const result = await createAdminOrder(
      db,
      parsed.data,
      actor,
      new Date(),
      parsed.data.requestId,
    );
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    if (error instanceof AdminMutationIdempotencyConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
