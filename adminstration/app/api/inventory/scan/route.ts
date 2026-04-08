import { NextRequest, NextResponse } from 'next/server';
import { eq, inArray } from 'drizzle-orm';

import { getDb, hasDb } from '../../../../db/client';
import { products } from '../../../../db/schema';
import { loadOrderDetail } from '../../../../lib/admin-orders-data';
import { buildInventoryRowSelection } from '../../../../lib/inventory-actions';
import { inventoryScanQuerySchema } from '../../../../lib/inventory';
import { requireMutationAccess } from '../../../../lib/rbac';

function isExactNumeric(value: string) {
  return /^\d+$/.test(value);
}

export async function POST(req: NextRequest) {
  const denied = await requireMutationAccess('products');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const parsed = inventoryScanQuerySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();
  const query = parsed.data.query.trim();

  if (isExactNumeric(query)) {
    const order = await loadOrderDetail(Number(query));

    if (order) {
      const productIds = [...new Set(
        order.orderProducts
          .map((item) => item.productId)
          .filter((item): item is number => item != null),
      )];
      const productRows = productIds.length > 0
        ? await db
          .select({
            id: products.id,
            inventoryQuantity: products.inventoryQuantity,
          })
          .from(products)
          .where(inArray(products.id, productIds))
        : [];
      const inventoryById = new Map(productRows.map((item) => [item.id, item.inventoryQuantity]));

      return NextResponse.json({
        kind: 'order',
        order: {
          id: order.id,
          fullName: order.fullName,
        },
        items: order.orderProducts.map((item) => {
          if (item.productId == null) {
            return {
              productId: null,
              title: item.title,
              quantity: item.quantity,
              inventoryQuantity: null,
              selectable: false,
              reason: 'Missing catalog match.',
            };
          }

          return {
            productId: item.productId,
            title: item.title,
            quantity: item.quantity,
            inventoryQuantity: inventoryById.get(item.productId) ?? 0,
            selectable: true,
          };
        }),
      });
    }
  }

  const [inventoryItem] = await db
    .select(buildInventoryRowSelection())
    .from(products)
    .where(eq(products.barcode, query))
    .limit(1);

  if (inventoryItem) {
    return NextResponse.json({
      kind: 'barcode',
      item: inventoryItem,
    });
  }

  return NextResponse.json({ kind: 'none' });
}
