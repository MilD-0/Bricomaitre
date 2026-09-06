import { and, count, eq, inArray, lt, or } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { orders } from '@bric/db/schema';
import { normalizeAlgeriaPhone } from '@bric/storefront-core/meta';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';

import { requireMutationAccess } from '../../../../../lib/rbac';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response: denied } = await requireMutationAccess('orders');
  if (denied) return denied;
  if (!hasDb())
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });

  const orderId = parsePositiveIntegerId((await params).id);
  if (orderId === null) return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });

  const db = getDb();
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const normalizedPhone = order.normalizedPhone ?? normalizeAlgeriaPhone(order.phoneNumber1);
  const phoneCondition = normalizedPhone
    ? or(eq(orders.normalizedPhone, normalizedPhone), eq(orders.phoneNumber1, order.phoneNumber1))
    : eq(orders.phoneNumber1, order.phoneNumber1);
  const [summary] = await db
    .select({ completedOrderCount: count() })
    .from(orders)
    .where(
      and(
        phoneCondition,
        inArray(orders.inHouseStatus, [ORDER_STATUS.COMPLETED, ORDER_STATUS.MANUAL_COMPLETED]),
        lt(orders.createdAt, order.createdAt),
      ),
    );

  return NextResponse.json({ completedOrderCount: summary?.completedOrderCount ?? 0 });
}
