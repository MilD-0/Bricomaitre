import { getDb, getPool } from '@bric/db/client';
import { actionLogs, adminMutationIdempotency, products } from '@bric/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it, vi } from 'vitest';
import { revalidateTag } from 'next/cache';

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
import { ActionHistoryEntityNotFoundError } from '../lib/action-history-state';
import {
  applyAdminInventoryBatch,
  inspectAdminInventoryScan,
  updateAdminInventoryProduct,
} from '../lib/admin-inventory-workflow';
import { ProductIntegrityConflictError } from '../lib/product-integrity';

afterAll(async () => {
  await getPool().end();
});

it('keeps batch partial outcomes replayable and uses canonical barcode uniqueness for inventory edits', async () => {
  const db = getDb();
  const marker = randomUUID();
  const actor = { email: `inventory-${marker}@example.invalid` };
  const rows = await db
    .insert(products)
    .values(
      [5, 1].map((quantity, index) => ({
        title: 'Inventory',
        slug: `${marker}-${index}`,
        price: '100',
        inventoryQuantity: quantity,
        barcode: index === 0 ? `CODE-${marker}` : null,
      })),
    )
    .returning();
  const requestId = `inventory-${marker}`;
  const retailBarcode = `9900000000${Date.now()}`;
  vi.stubEnv('STOREFRONT_REVALIDATE_SECRET', '');
  try {
    const input = {
      requestId,
      mode: 'decrease' as const,
      items: [
        { productId: rows[0]!.id, quantity: 2 },
        { productId: rows[1]!.id, quantity: 2 },
        { productId: 2147483647, quantity: 1 },
      ],
    };
    const result = await applyAdminInventoryBatch(db, input, actor);
    expect(result).toEqual({
      ok: true,
      complete: false,
      items: [{ productId: rows[0]!.id, previousQuantity: 5, nextQuantity: 3 }],
      skipped: [
        { productId: rows[1]!.id, reason: 'insufficient', available: 1 },
        { productId: 2147483647, reason: 'missing' },
      ],
    });
    expect(revalidateTag).toHaveBeenCalledWith('products', { expire: 0 });
    vi.mocked(revalidateTag).mockClear();
    expect(await applyAdminInventoryBatch(db, input, actor)).toEqual(result);
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(
      (await db.select().from(products).where(eq(products.id, rows[0]!.id)))[0]!.inventoryQuantity,
    ).toBe(3);
    const logs = await db.select().from(actionLogs).where(eq(actionLogs.createdBy, actor.email));
    expect(logs).toHaveLength(1);
    await expect(
      updateAdminInventoryProduct(db, rows[1]!.id, { barcode: ` code-${marker} ` }, actor),
    ).rejects.toBeInstanceOf(ProductIntegrityConflictError);
    expect(
      (await db.select().from(products).where(eq(products.id, rows[1]!.id)))[0]!.barcode,
    ).toBeNull();
    expect(await db.select().from(actionLogs).where(eq(actionLogs.createdBy, actor.email))).toEqual(
      logs,
    );
    const item = await updateAdminInventoryProduct(
      db,
      rows[1]!.id,
      { barcode: retailBarcode, inStock: false },
      actor,
    );
    expect(item).toMatchObject({
      barcode: retailBarcode,
      inStock: false,
      availabilityStatus: 'out_of_stock',
      inventoryQuantity: 1,
    });
    expect(await inspectAdminInventoryScan(db, { query: retailBarcode })).toMatchObject({
      kind: 'barcode',
      item: { id: rows[1]!.id },
    });
    await expect(
      updateAdminInventoryProduct(db, 2147483647, { inStock: true }, actor),
    ).rejects.toBeInstanceOf(ActionHistoryEntityNotFoundError);
  } finally {
    vi.unstubAllEnvs();
    await db.delete(products).where(
      inArray(
        products.id,
        rows.map((row) => row.id),
      ),
    );
    await db.delete(actionLogs).where(eq(actionLogs.createdBy, actor.email));
    await db
      .delete(adminMutationIdempotency)
      .where(eq(adminMutationIdempotency.requestId, requestId));
  }
});
