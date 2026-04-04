import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { getDb, hasDb } from '../../../../db/client';
import { products } from '../../../../db/schema';
import { mutateEntityWithHistory } from '../../../../lib/action-history';
import { auth } from '../../../../lib/auth';
import { inventoryBarcodeSchema } from '../../../../lib/inventory';
import { requireMutationAccess } from '../../../../lib/rbac';

const inventoryMutationSchema = z.union([
  z.object({
    delta: z.coerce.number().int().refine((value) => value !== 0, 'Delta must not be zero'),
  }),
  z.object({
    inStock: z.boolean(),
  }),
  inventoryBarcodeSchema,
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMutationAccess('products');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const parsed = inventoryMutationSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const numericId = Number(id);
  const db = getDb();
  const current = await db.query.products.findFirst({ where: eq(products.id, numericId) });

  if (!current) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };
  const updateValues = 'delta' in parsed.data
    ? {
      inventoryQuantity: Math.max(0, current.inventoryQuantity + parsed.data.delta),
      updatedAt: new Date(),
    }
    : {
      ...('inStock' in parsed.data
        ? { inStock: parsed.data.inStock }
        : { barcode: parsed.data.barcode }),
      updatedAt: new Date(),
    };

  const [updated] = await mutateEntityWithHistory(db, {
    entityType: 'products',
    entityId: numericId,
    operation: 'update',
    actor,
    execute: (tx) => tx
      .update(products)
      .set(updateValues)
      .where(eq(products.id, numericId))
      .returning({
        id: products.id,
        title: products.title,
        sku: products.sku,
        barcode: products.barcode,
        inStock: products.inStock,
        availabilityStatus: products.availabilityStatus,
        inventoryQuantity: products.inventoryQuantity,
        updatedAt: products.updatedAt,
      }),
  });

  return NextResponse.json({ ok: true, item: updated });
}
