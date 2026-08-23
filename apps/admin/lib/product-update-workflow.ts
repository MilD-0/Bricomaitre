import { and, eq } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import { landingPages, productPromoCodes, productSlugHistory, products } from '@bric/db/schema';
import { mutateEntityWithHistory } from './action-history';
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

export async function readProductMutationPayload(
  db: Database,
  productId: number,
): Promise<ProductPayload> {
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
  });
  if (!product || product.archivedAt) throw new ProductMutationNotFoundError(productId);
  const promoCodes = await db
    .select()
    .from(productPromoCodes)
    .where(eq(productPromoCodes.productId, productId));
  return productPayloadSchema.parse({
    title: product.title,
    slug: product.slug,
    titleAr: product.titleAr,
    description: product.description,
    descriptionAr: product.descriptionAr,
    sku: product.sku,
    barcode: product.barcode,
    price: product.price,
    oldPrice: product.oldPrice,
    purchasePrice: product.purchasePrice,
    active: product.active,
    inStock: product.inStock,
    availabilityStatus: product.availabilityStatus,
    inventoryQuantity: product.inventoryQuantity,
    brandId: product.brandId,
    categoryId: product.categoryId,
    images: product.images,
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
  const values = await toProductMutationValues(data, productId);
  await mutateEntityWithHistory(db, {
    entityType: 'products',
    entityId: productId,
    operation: 'update',
    actor,
    execute: async (tx) => {
      await assertUniqueProductIdentifiers(tx, values, productId);
      const updatedAt = new Date();
      const [current] = await tx
        .select({ slug: products.slug })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);
      if (!current) throw new ProductMutationNotFoundError(productId);
      if (current.slug !== values.slug) {
        await tx
          .delete(productSlugHistory)
          .where(
            and(
              eq(productSlugHistory.productId, productId),
              eq(productSlugHistory.slug, values.slug),
            ),
          );
        await tx
          .insert(productSlugHistory)
          .values({ productId, slug: current.slug })
          .onConflictDoNothing();
      }
      await tx
        .update(products)
        .set({ ...values, updatedAt })
        .where(eq(products.id, productId));
      await tx
        .update(landingPages)
        .set({ slug: values.slug, updatedAt, updatedBy: actor.email })
        .where(eq(landingPages.productId, productId));
      await tx.delete(productPromoCodes).where(eq(productPromoCodes.productId, productId));
      const promoRows = toProductPromoRows(productId, data.promoCodes);
      if (promoRows.length > 0) await tx.insert(productPromoCodes).values(promoRows);
    },
  });
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
  const values = await toProductMutationValues(data);
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

export { ProductIntegrityConflictError };
