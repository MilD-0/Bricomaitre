import { getDb } from '@bric/db/client';
import { z } from 'zod';

import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { brands, categories, productPromoCodes, products } from '@bric/db/schema';
import { searchAssetProductOptions } from './admin-assets-data';
import { productMutationPayload } from './product-update-workflow';

export const adminAiCatalogProductLookupSchema = z
  .object({
    query: z.string().trim().max(200).default(''),
    productIds: z.array(z.number().int().positive()).max(100).default([]),
    page: z.number().int().positive().default(1),
    limit: z.number().int().min(1).max(50).default(10),
  })
  .strict()
  .refine((input) => input.query.length > 0 || input.productIds.length > 0, {
    message: 'Provide a search query or at least one product ID.',
  });

export const adminAiCatalogProductInspectionSchema = z
  .object({
    productIds: z.array(z.number().int().positive()).min(1).max(10),
  })
  .strict();

export const adminAiArchivedCatalogProductInspectionSchema = z
  .object({
    productIds: z.array(z.number().int().positive()).min(1).max(20),
  })
  .strict();

export const ADMIN_AI_FIND_PRODUCTS_TOOL_DESCRIPTION =
  'Find current non-archived products by relevant product text, identifier, brand, category, or exact ID. Returns lightweight identities; inspect only the exact products whose details matter.';

export const ADMIN_AI_INSPECT_PRODUCTS_TOOL_DESCRIPTION =
  'Read current non-archived product records for exact IDs, including prices, stock, content, promotions, and resolved taxonomy. This reads current catalog state, not dated performance.';

export const ADMIN_AI_INSPECT_ARCHIVED_PRODUCTS_TOOL_DESCRIPTION =
  'Read full archived product records for exact IDs, including archive time, prices, retained inventory, content, promotions, and taxonomy assignments.';

export async function findAdminCatalogProducts(
  raw: z.input<typeof adminAiCatalogProductLookupSchema>,
) {
  const input = adminAiCatalogProductLookupSchema.parse(raw);
  return searchAssetProductOptions({
    search: input.query,
    ids: input.productIds,
    page: input.page,
    limit: input.limit,
  });
}

async function inspectProducts(productIds: number[], archived: boolean) {
  const db = getDb();
  const requestedIds = [...new Set(productIds)];
  const parent = alias(categories, 'parent_category');
  const rows = await db
    .select({
      product: products,
      brand: {
        id: brands.id,
        name: brands.name,
        slug: brands.slug,
        active: brands.isActive,
      },
      category: {
        id: categories.id,
        name: categories.name,
        nameAr: categories.nameAr,
        slug: categories.slug,
        active: categories.isActive,
        parentId: categories.parentId,
        parentName: parent.name,
      },
    })
    .from(products)
    .leftJoin(brands, eq(brands.id, products.brandId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(parent, eq(parent.id, categories.parentId))
    .where(
      and(
        inArray(products.id, requestedIds),
        archived ? isNotNull(products.archivedAt) : isNull(products.archivedAt),
      ),
    );
  const promotions =
    rows.length > 0
      ? await db
          .select()
          .from(productPromoCodes)
          .where(
            inArray(
              productPromoCodes.productId,
              rows.map(({ product }) => product.id),
            ),
          )
          .orderBy(asc(productPromoCodes.id))
      : [];
  const promotionsByProduct = new Map<number, typeof promotions>();
  for (const promotion of promotions) {
    const current = promotionsByProduct.get(promotion.productId) ?? [];
    current.push(promotion);
    promotionsByProduct.set(promotion.productId, current);
  }
  const byId = new Map(rows.map((row) => [row.product.id, row]));
  return {
    requestedIds,
    missingIds: requestedIds.filter((id) => !byId.has(id)),
    items: requestedIds.flatMap((id) => {
      const row = byId.get(id);
      if (!row) return [];
      const product = productMutationPayload(row.product, promotionsByProduct.get(id) ?? []);
      return [
        {
          id,
          archivedAt: row.product.archivedAt?.toISOString() ?? null,
          identity: {
            title: product.title,
            titleAr: product.titleAr,
            slug: product.slug,
            sku: product.sku,
            barcode: product.barcode,
          },
          pricing: {
            sellingPriceDzd: product.price,
            compareAtPriceDzd: product.oldPrice,
            purchaseCostDzd: product.purchasePrice,
            promoCodes: product.promoCodes,
          },
          availability: {
            active: product.active,
            inStock: product.inStock,
            status: product.availabilityStatus,
            inventoryQuantity: product.inventoryQuantity,
          },
          taxonomy: {
            brand: row.brand,
            category: row.category?.id ? row.category : null,
            assignedBrandId: product.brandId,
            assignedCategoryId: product.categoryId,
          },
          content: {
            description: product.description,
            descriptionAr: product.descriptionAr,
            images: product.images,
          },
        },
      ];
    }),
  };
}

export async function inspectAdminCatalogProducts(
  raw: z.input<typeof adminAiCatalogProductInspectionSchema>,
) {
  const input = adminAiCatalogProductInspectionSchema.parse(raw);
  return { kind: 'catalog_products' as const, ...(await inspectProducts(input.productIds, false)) };
}

export async function inspectAdminArchivedCatalogProducts(
  raw: z.input<typeof adminAiArchivedCatalogProductInspectionSchema>,
) {
  const input = adminAiArchivedCatalogProductInspectionSchema.parse(raw);
  return {
    kind: 'archived_catalog_products' as const,
    ...(await inspectProducts(input.productIds, true)),
  };
}
