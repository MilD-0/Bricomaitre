import { and, eq, isNotNull } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import { landingPages, productPromoCodes, productSlugHistory, products } from '@bric/db/schema';
import { mutateEntityWithHistory, type Transaction } from './action-history';
import type { fetchProductState } from './action-history-state';
import { landingPageSlugFromProduct } from './landing-pages';
import { toProductMutationValues, toProductPromoRows } from './product-mutations';
import { assertUniqueProductIdentifiers, ProductIntegrityConflictError } from './product-integrity';
import { productPayloadSchema, type ProductPayload } from './products';

type Database = ReturnType<typeof getDb>;

export type ProductMutationActor = {
  email?: string | null;
  name?: string | null;
};

export class ProductMutationNotFoundError extends Error {
  constructor(readonly productId: number) {
    super(`Product ${productId} was not found.`);
    this.name = 'ProductMutationNotFoundError';
  }
}

function promoDate(value: Date | null) {
  return value?.toISOString() ?? null;
}

export function productMutationPayload(
  product: typeof products.$inferSelect,
  promoCodes: (typeof productPromoCodes.$inferSelect)[],
): ProductPayload {
  return productPayloadSchema.parse({
    ...product,
    promoCodes: promoCodes.map((promo) => ({
      code: promo.code,
      promoPrice: promo.promoPrice,
      active: promo.active,
      startsAt: promoDate(promo.startsAt),
      endsAt: promoDate(promo.endsAt),
    })),
  });
}

export async function replaceProductThroughCanonicalWorkflow(
  db: Database,
  productId: number,
  input: unknown,
  actor: ProductMutationActor,
) {
  const data = productPayloadSchema.parse(input);
  return mutateEntityWithHistory(db, {
    entityType: 'products',
    entityId: productId,
    operation: 'update',
    actor,
    execute: (tx, beforeState) =>
      writeProductReplacement(tx, productId, data, actor, String(beforeState!.slug)),
  });
}

export async function patchProductThroughCanonicalWorkflow(
  db: Database,
  productId: number,
  changes: Partial<ProductPayload>,
  actor: ProductMutationActor,
) {
  return mutateEntityWithHistory(db, {
    entityType: 'products',
    entityId: productId,
    operation: 'update',
    actor,
    execute: async (tx, beforeState) => {
      const stored = beforeState as NonNullable<Awaited<ReturnType<typeof fetchProductState>>>;
      if (stored.archivedAt) throw new ProductMutationNotFoundError(productId);
      const previous = productMutationPayload(stored, stored.promoCodes);
      const merged = { ...previous, ...changes };
      if (changes.availabilityStatus !== undefined && changes.inStock === undefined) {
        merged.inStock = changes.availabilityStatus === 'in_stock';
      }
      const data = productPayloadSchema.parse(merged);
      const result = await writeProductReplacement(tx, productId, data, actor, stored.slug);
      return { ...result, previous };
    },
  });
}

async function writeProductReplacement(
  tx: Transaction,
  productId: number,
  data: ProductPayload,
  actor: ProductMutationActor,
  currentSlug: string,
) {
  const values = await toProductMutationValues(tx, data, productId);
  await assertUniqueProductIdentifiers(tx, values, productId);
  const updatedAt = new Date();
  const slugChanged = currentSlug !== values.slug;
  if (slugChanged) {
    await tx
      .delete(productSlugHistory)
      .where(
        and(eq(productSlugHistory.productId, productId), eq(productSlugHistory.slug, values.slug)),
      );
    await tx
      .insert(productSlugHistory)
      .values({ productId, slug: currentSlug })
      .onConflictDoNothing();
  }
  await tx
    .update(products)
    .set({ ...values, updatedAt })
    .where(eq(products.id, productId));
  if (slugChanged) {
    const pages = await tx
      .select({ id: landingPages.id })
      .from(landingPages)
      .where(eq(landingPages.productId, productId));
    for (const page of pages) {
      await tx
        .update(landingPages)
        .set({
          slug: landingPageSlugFromProduct(values, page.id),
          updatedAt,
          updatedBy: actor.email,
        })
        .where(eq(landingPages.id, page.id));
    }
  }
  await tx.delete(productPromoCodes).where(eq(productPromoCodes.productId, productId));
  const promoRows = toProductPromoRows(productId, data.promoCodes);
  if (promoRows.length > 0) await tx.insert(productPromoCodes).values(promoRows);
  return {
    id: productId,
    slug: values.slug,
    title: values.title,
    price: values.price,
    purchasePrice: values.purchasePrice,
    active: values.active,
    inStock: values.inStock,
    availabilityStatus: values.availabilityStatus,
    brandId: values.brandId,
    categoryId: values.categoryId,
    promoCodeCount: data.promoCodes.length,
  };
}

export async function createProductThroughCanonicalWorkflow(
  db: Database,
  input: unknown,
  actor: ProductMutationActor,
) {
  const data = productPayloadSchema.parse(input);
  const values = await toProductMutationValues(db, data);
  const rows = await mutateEntityWithHistory(db, {
    entityType: 'products',
    operation: 'create',
    actor,
    execute: async (tx) => {
      await assertUniqueProductIdentifiers(tx, values);
      const created = await tx.insert(products).values(values).returning({ id: products.id });
      const productId = created[0]?.id;
      if (!productId) throw new Error('Unable to create product.');
      const promoRows = toProductPromoRows(productId, data.promoCodes);
      if (promoRows.length > 0) await tx.insert(productPromoCodes).values(promoRows);
      return created;
    },
    resolveEntityId: (result) => result[0]?.id,
  });
  const productId = rows[0]?.id;
  if (!productId) throw new Error('Unable to create product.');
  return {
    id: productId,
    slug: values.slug,
    title: values.title,
    price: values.price,
    purchasePrice: values.purchasePrice,
    active: values.active,
    inStock: values.inStock,
    availabilityStatus: values.availabilityStatus,
    inventoryQuantity: values.inventoryQuantity,
    brandId: values.brandId,
    categoryId: values.categoryId,
    promoCodeCount: data.promoCodes.length,
  };
}

export async function archiveProductThroughCanonicalWorkflow(
  db: Database,
  productId: number,
  actor: ProductMutationActor,
) {
  const rows = await mutateEntityWithHistory(db, {
    entityType: 'products',
    entityId: productId,
    operation: 'update',
    actor,
    execute: (tx) =>
      tx
        .update(products)
        .set({
          archivedAt: new Date(),
          active: false,
          inStock: false,
          availabilityStatus: 'out_of_stock',
          updatedAt: new Date(),
        })
        .where(eq(products.id, productId))
        .returning({ id: products.id }),
  });
  if (!rows[0]?.id) throw new ProductMutationNotFoundError(productId);
  return { id: productId, archived: true as const };
}

export async function restoreProductThroughCanonicalWorkflow(
  db: Database,
  productId: number,
  actor: ProductMutationActor,
) {
  const rows = await mutateEntityWithHistory(db, {
    entityType: 'products',
    entityId: productId,
    operation: 'update',
    actor,
    execute: (tx) =>
      tx
        .update(products)
        .set({ archivedAt: null, updatedAt: new Date() })
        .where(and(eq(products.id, productId), isNotNull(products.archivedAt)))
        .returning({
          id: products.id,
          title: products.title,
          active: products.active,
          inStock: products.inStock,
          availabilityStatus: products.availabilityStatus,
        }),
  });
  const restored = rows[0];
  if (!restored?.id) throw new ProductMutationNotFoundError(productId);
  return { ...restored, archived: false as const };
}

export { ProductIntegrityConflictError };
