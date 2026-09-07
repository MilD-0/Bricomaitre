import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { getDb, getPool } from '@bric/db/client';
import { actionLogs, orderLineItems, orders, products, shoppingListDrafts } from '@bric/db/schema';
import { getRedis } from '@bric/runtime/redis';

import { applyHistoryAction } from '../lib/action-history';
import { getReportingDb } from '../lib/reporting-db';

import { buildGeneratedShoppingListDraft } from '../lib/shopping-list-drafts';
import { saveAdminShoppingListDraft } from '../lib/shopping-list-drafts.server';
import { applyShoppingListInventory } from '../lib/shopping-list-inventory.server';
vi.mock('../lib/server-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/server-cache')>()),
  revalidateServerTags: vi.fn(),
}));
vi.mock('../lib/storefront-revalidate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/storefront-revalidate')>()),
  revalidateStorefrontProducts: vi.fn(),
}));

const runId = randomUUID();

describe('real PostgreSQL and Redis contracts', () => {
  afterAll(async () => {
    await Promise.allSettled([getRedis().quit(), getPool().end(), getReportingDb().$client.end()]);
  });

  it('recovers shopping stock and order allocations atomically with history conflicts', async () => {
    const { orderInventoryAllocations } = await import('@bric/db/schema');
    const { applyInventoryQuantityChange } = await import('../lib/inventory-actions');
    const { ActionHistoryConflictError } = await import('../lib/action-history');
    const rollback = new Error('stock recovery fixture rollback');
    await expect(
      getDb().transaction(async (tx) => {
        const db = tx as unknown as ReturnType<typeof getDb>;
        const [product] = await tx
          .insert(products)
          .values({
            title: `Recovery ${runId}`,
            slug: `recovery-${runId}`,
            price: '10',
            inventoryQuantity: 20,
          })
          .returning();
        const [order] = await tx
          .insert(orders)
          .values({ firstName: runId, phoneNumber1: '0661920629' })
          .returning();
        await tx.insert(orderLineItems).values({
          orderId: order!.id,
          productId: product!.id,
          contentId: String(product!.id),
          rawValue: String(product!.id),
          titleSnapshot: product!.title!,
          originalUnitPrice: '10',
          effectiveUnitPrice: '10',
          quantity: 2,
          lineTotal: '20',
        });
        const generated = await buildGeneratedShoppingListDraft({
          sourceMode: 'selected',
          title: 'Recovery fixture',
          orders: [
            {
              id: order!.id,
              fullName: runId,
              note: null,
              orderProducts: [
                {
                  productId: product!.id,
                  rawValue: String(product!.id),
                  title: product!.title!,
                  unitPrice: 10,
                  quantity: 2,
                  lineTotal: 20,
                  thumbnailUrl: null,
                  missing: false,
                },
              ],
            },
          ],
          resolveProductDetails: async () => ({ inventoryQuantity: 20, purchasePrice: null }),
          resolveBrandName: async () => 'Unbranded',
        });
        const draft = await saveAdminShoppingListDraft(db, {
          ...generated,
          revision: null,
          draftItems: generated.draftItems.map((item) => ({
            ...item,
            quantity: 3,
            inventoryDecreaseQuantity: 3,
          })),
        });
        const applied = await applyShoppingListInventory(db, {
          sourceMode: draft.sourceMode,
          orderIds: draft.orderIds,
          revision: draft.revision,
          draftIds: draft.draftItems.map((item) => item.draftId),
          requestId: `recovery-${runId}`,
        });
        expect(applied.items).toEqual([
          { productId: product!.id, previousQuantity: 20, nextQuantity: 17 },
        ]);
        const [entry] = await tx
          .select()
          .from(actionLogs)
          .where(and(eq(actionLogs.entityType, 'products'), eq(actionLogs.entityId, product!.id)));
        expect(entry!.afterState).toMatchObject({
          stockAllocations: {
            orders: [{ orderId: order!.id, productId: product!.id, quantity: 2 }],
            manual: { scopeKey: draft.scopeKey, productId: product!.id, quantity: 1 },
          },
        });
        const readState = async () => {
          const [currentProduct] = await tx
            .select()
            .from(products)
            .where(eq(products.id, product!.id));
          const [allocation] = await tx
            .select()
            .from(orderInventoryAllocations)
            .where(eq(orderInventoryAllocations.orderId, order!.id));
          const [currentDraft] = await tx
            .select()
            .from(shoppingListDrafts)
            .where(eq(shoppingListDrafts.scopeKey, draft.scopeKey));
          const generatedItems = currentDraft!.generatedItems as Array<{
            productId: number;
            inventoryManualAppliedQuantity: number;
            inventoryAppliedQuantity: number;
          }>;
          const item = generatedItems.find((item) => item.productId === product!.id)!;
          return {
            stock: currentProduct!.inventoryQuantity,
            allocation,
            item,
            revision: currentDraft!.revision,
          };
        };
        await applyHistoryAction(db, { actionLogId: entry!.id, direction: 'undo' });
        expect(await readState()).toMatchObject({
          stock: 20,
          allocation: { quantity: 0 },
          item: {
            inventoryManualAppliedQuantity: 0,
            inventoryAppliedQuantity: 0,
            inventoryQuantity: 20,
          },
          revision: applied.draft.revision + 1,
        });
        await expect(
          applyHistoryAction(db, { actionLogId: entry!.id, direction: 'undo' }),
        ).rejects.toBeInstanceOf(ActionHistoryConflictError);
        await applyHistoryAction(db, { actionLogId: entry!.id, direction: 'redo' });
        expect(await readState()).toMatchObject({
          stock: 17,
          allocation: { quantity: 2 },
          item: { inventoryManualAppliedQuantity: 1, inventoryAppliedQuantity: 3 },
        });
        const { archiveProductThroughCanonicalWorkflow, restoreProductThroughCanonicalWorkflow } =
          await import('../lib/product-update-workflow');
        const archiveRollback = new Error('archive fixture savepoint rollback');
        await expect(
          tx.transaction(async (archiveTx) => {
            const archiveDb = archiveTx as unknown as ReturnType<typeof getDb>;
            await archiveProductThroughCanonicalWorkflow(archiveDb, product!.id, {});
            expect(await readState()).toMatchObject({
              stock: 17,
              allocation: { quantity: 2 },
              item: { inventoryManualAppliedQuantity: 1 },
            });
            const [archivedProduct] = await archiveTx
              .select()
              .from(products)
              .where(eq(products.id, product!.id));
            expect(archivedProduct!.archivedAt).not.toBeNull();
            await restoreProductThroughCanonicalWorkflow(archiveDb, product!.id, {});
            expect(await readState()).toMatchObject({ stock: 17, allocation: { quantity: 2 } });
            const archiveHistory = await archiveTx
              .select()
              .from(actionLogs)
              .where(
                and(eq(actionLogs.entityType, 'products'), eq(actionLogs.entityId, product!.id)),
              );
            const lifecycle = archiveHistory
              .filter((row) => row.id !== entry!.id)
              .sort((a, b) => b.id - a.id);
            for (const action of lifecycle)
              await applyHistoryAction(archiveDb, { actionLogId: action.id, direction: 'undo' });
            expect(await readState()).toMatchObject({
              stock: 17,
              allocation: { quantity: 2 },
              item: { inventoryManualAppliedQuantity: 1 },
            });
            expect(
              (await archiveTx.select().from(products).where(eq(products.id, product!.id)))[0]!
                .archivedAt,
            ).toBeNull();
            throw archiveRollback;
          }),
        ).rejects.toBe(archiveRollback);
        // Pre-metadata stock changes cannot reveal whether they consumed these orders.
        const legacyBefore = { ...(entry!.beforeState as Record<string, unknown>) };
        const legacyAfter = { ...(entry!.afterState as Record<string, unknown>) };
        delete legacyBefore.stockAllocations;
        delete legacyAfter.stockAllocations;
        delete legacyBefore.stockHistoryVersion;
        delete legacyAfter.stockHistoryVersion;
        await tx
          .update(actionLogs)
          .set({ beforeState: legacyBefore, afterState: legacyAfter })
          .where(eq(actionLogs.id, entry!.id));
        await expect(
          applyHistoryAction(db, { actionLogId: entry!.id, direction: 'undo' }),
        ).rejects.toThrow('older stock action');
        expect(await readState()).toMatchObject({
          stock: 17,
          allocation: { quantity: 2 },
          item: { inventoryManualAppliedQuantity: 1 },
        });
        await tx
          .update(actionLogs)
          .set({ beforeState: entry!.beforeState, afterState: entry!.afterState })
          .where(eq(actionLogs.id, entry!.id));
        // A changed manual balance must roll both stock and order counters back.
        const [savedDraft] = await tx
          .select()
          .from(shoppingListDrafts)
          .where(eq(shoppingListDrafts.scopeKey, draft.scopeKey));
        const savedGenerated = savedDraft!.generatedItems as Array<Record<string, unknown>>;
        await tx
          .update(shoppingListDrafts)
          .set({
            generatedItems: savedGenerated.map((item) => ({
              ...item,
              inventoryManualAppliedQuantity: 2,
            })),
          })
          .where(eq(shoppingListDrafts.id, savedDraft!.id));
        await expect(
          applyHistoryAction(db, { actionLogId: entry!.id, direction: 'undo' }),
        ).rejects.toBeInstanceOf(ActionHistoryConflictError);
        expect(await readState()).toMatchObject({
          stock: 17,
          allocation: { quantity: 2 },
          item: { inventoryManualAppliedQuantity: 2 },
        });
        await tx
          .update(shoppingListDrafts)
          .set({ generatedItems: savedGenerated })
          .where(eq(shoppingListDrafts.id, savedDraft!.id));
        // An allocation changed outside this action must roll the stock write back too.
        await tx
          .update(orderInventoryAllocations)
          .set({ quantity: 1 })
          .where(eq(orderInventoryAllocations.orderId, order!.id));
        await expect(
          applyHistoryAction(db, { actionLogId: entry!.id, direction: 'undo' }),
        ).rejects.toBeInstanceOf(ActionHistoryConflictError);
        expect(await readState()).toMatchObject({
          stock: 17,
          allocation: { quantity: 1 },
          item: { inventoryManualAppliedQuantity: 1 },
        });
        expect(
          (await tx.select().from(actionLogs).where(eq(actionLogs.id, entry!.id)))[0]!.isUndone,
        ).toBe(false);
        await tx
          .update(orderInventoryAllocations)
          .set({ quantity: 2, needsReview: true, legacyScopeKeys: ['retained-provenance'] })
          .where(eq(orderInventoryAllocations.orderId, order!.id));
        // Regular product history still gates older shopping deductions.
        await applyInventoryQuantityChange(db, {
          productId: product!.id,
          mode: 'increase',
          quantity: 1,
        });
        await expect(
          applyHistoryAction(db, { actionLogId: entry!.id, direction: 'undo' }),
        ).rejects.toThrow('Only the latest applied action can be undone');
        const history = await tx
          .select()
          .from(actionLogs)
          .where(and(eq(actionLogs.entityType, 'products'), eq(actionLogs.entityId, product!.id)));
        const correction = history.find((row) => row.id !== entry!.id)!;
        await applyHistoryAction(db, { actionLogId: correction.id, direction: 'undo' });
        await applyHistoryAction(db, { actionLogId: entry!.id, direction: 'undo' });
        expect(await readState()).toMatchObject({
          stock: 20,
          allocation: { quantity: 0, needsReview: true, legacyScopeKeys: ['retained-provenance'] },
          item: {
            inventoryManualAppliedQuantity: 0,
            inventoryAppliedQuantity: 0,
            inventoryQuantity: 20,
          },
        });
        const { mutateEntityWithHistory } = await import('../lib/action-history');
        const [legacyProduct] = await mutateEntityWithHistory(db, {
          entityType: 'products',
          operation: 'create',
          execute: (inner) =>
            inner
              .insert(products)
              .values({
                title: 'Imported stock history',
                slug: `recovery-legacy-${runId}`,
                price: '10',
                inventoryQuantity: 5,
              })
              .returning(),
          resolveEntityId: (rows) => rows[0]!.id,
        });
        const [creation] = await tx
          .select()
          .from(actionLogs)
          .where(
            and(eq(actionLogs.entityType, 'products'), eq(actionLogs.entityId, legacyProduct!.id)),
          );
        await tx
          .insert(orderInventoryAllocations)
          .values({ orderId: order!.id, productId: legacyProduct!.id, quantity: 1 });
        await expect(
          applyHistoryAction(db, { actionLogId: creation!.id, direction: 'undo' }),
        ).rejects.toThrow('allocations must be recovered');
        expect(
          await tx.select().from(products).where(eq(products.id, legacyProduct!.id)),
        ).toHaveLength(1);
        await tx
          .update(orderInventoryAllocations)
          .set({ quantity: 0, needsReview: true })
          .where(eq(orderInventoryAllocations.productId, legacyProduct!.id));
        await expect(
          applyHistoryAction(db, { actionLogId: creation!.id, direction: 'undo' }),
        ).rejects.toThrow('allocations must be recovered');
        expect(
          (
            await tx
              .select()
              .from(orderInventoryAllocations)
              .where(eq(orderInventoryAllocations.productId, legacyProduct!.id))
          )[0]!.needsReview,
        ).toBe(true);
        await tx
          .update(orderInventoryAllocations)
          .set({ needsReview: false })
          .where(eq(orderInventoryAllocations.productId, legacyProduct!.id));
        await applyHistoryAction(db, { actionLogId: creation!.id, direction: 'undo' });
        expect(
          await tx.select().from(products).where(eq(products.id, legacyProduct!.id)),
        ).toHaveLength(0);
        await applyHistoryAction(db, { actionLogId: creation!.id, direction: 'redo' });
        expect(
          await tx.select().from(products).where(eq(products.id, legacyProduct!.id)),
        ).toHaveLength(1);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});
