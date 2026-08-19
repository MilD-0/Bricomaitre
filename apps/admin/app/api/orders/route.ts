import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gte } from 'drizzle-orm';

import { getDb, hasDb } from '@bric/db/client';
import { orders } from '@bric/db/schema';
import { storefrontOrderCreateSchema } from '@bric/storefront-core/order-domain';
import { createPublicOrderToken } from '@bric/storefront-core/order-access';
import { resolveOrderCommercialState } from '@bric/storefront-core/order-commercial';
import { insertCanonicalOrder } from '@bric/storefront-core/order-write';
import { normalizeAlgeriaPhone } from '@bric/storefront-core/meta';
import { loadOrdersPageData } from '../../../lib/admin-orders-data';
import { loadOrderDetail } from '../../../lib/admin-orders-data';
import { mutateEntityWithHistory } from '../../../lib/action-history';
import { auth } from '../../../lib/auth';
import { readEcotrackCatalog, resolveEcotrackDeliveryFee } from '../../../lib/ecotrack';
import { orderListQuerySchema } from '../../../lib/orders';
import { getRequestSearchParams } from '../../../lib/request';
import { canMutateResource, requireMutationAccess } from '../../../lib/rbac';

export async function GET(req: NextRequest) {
  const denied = await requireMutationAccess('orders');
  if (denied) {
    return denied;
  }

  const session = await auth();
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
    confirmed: searchParams.get('confirmed') ? Number(searchParams.get('confirmed')) : undefined,
    noAnswerCount: searchParams.get('noAnswerCount')
      ? Number(searchParams.get('noAnswerCount'))
      : undefined,
    sort: searchParams.getAll('sort'),
    sortKey: searchParams.get('sortKey') ?? undefined,
    sortDirection: searchParams.get('sortDirection') ?? undefined,
  };
  const parsed = orderListQuerySchema.safeParse(queryInput);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return NextResponse.json(await loadOrdersPageData(parsed.data, writable));
}

export async function POST(req: NextRequest) {
  const denied = await requireMutationAccess('orders');
  if (denied) return denied;
  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const parsed = storefrontOrderCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };
  const data = parsed.data;
  const now = new Date();
  const normalizedPhone = normalizeAlgeriaPhone(data.phoneNumber1);
  const [commercial, catalog] = await Promise.all([
    resolveOrderCommercialState(db, {
      cartProducts: data.cartProducts,
      promoCode: data.promoCode,
      now,
    }),
    data.state == null ? Promise.resolve(null) : readEcotrackCatalog(db),
  ]);
  const deliveryFee = catalog ? resolveEcotrackDeliveryFee(catalog, data.state, data.delivery) : 0;
  const degraded =
    commercial.lines.length === 0 ||
    data.state == null ||
    !data.city ||
    (data.delivery === 0 && !data.homeAddress);

  const duplicateCandidates = normalizedPhone
    ? await db
        .select({ id: orders.id, createdAt: orders.createdAt })
        .from(orders)
        .where(
          and(
            eq(orders.normalizedPhone, normalizedPhone),
            gte(orders.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1_000)),
          ),
        )
        .orderBy(desc(orders.createdAt))
        .limit(5)
    : [];

  const created = await mutateEntityWithHistory(db, {
    entityType: 'orders',
    operation: 'create',
    actor,
    execute: (tx) =>
      insertCanonicalOrder(tx, {
        commercial,
        deliveryFee,
        now,
        actor,
        values: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phoneNumber1: data.phoneNumber1,
          phoneNumber2: data.phoneNumber2,
          publicToken: createPublicOrderToken(),
          visitId: data.visitId,
          journeyId: data.journeyId,
          sessionId: data.sessionId,
          delivery: data.delivery,
          state: data.state,
          city: data.city,
          homeAddress: data.homeAddress,
          note: data.note,
          price: null,
          variant: degraded ? 'degraded_capture' : null,
        },
      }),
    resolveEntityId: (result) => result.order.id,
  });

  const item = await loadOrderDetail(created.order.id);
  return NextResponse.json(
    {
      ok: true,
      item,
      duplicateCandidates: duplicateCandidates.map((candidate) => ({
        id: candidate.id,
        createdAt: candidate.createdAt.toISOString(),
      })),
    },
    { status: 201 },
  );
}
