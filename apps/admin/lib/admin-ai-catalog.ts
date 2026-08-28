import { getDb } from '@bric/db/client';
import { z } from 'zod';

import { findAdminProducts } from './admin-ai-domain';
import { readBrand, readCategory } from './brands-categories-api';
import {
  ProductMutationNotFoundError,
  readArchivedProductMutationPayload,
  readProductMutationPayload,
} from './product-update-workflow';

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
  return findAdminProducts(input);
}

function taxonomyBrand(value: Awaited<ReturnType<typeof readBrand>>) {
  return value
    ? {
        id: Number(value.id),
        name: value.name,
        slug: value.slug,
        active: value.isActive,
      }
    : null;
}

function taxonomyCategory(value: Awaited<ReturnType<typeof readCategory>>) {
  return value
    ? {
        id: Number(value.id),
        name: value.name,
        nameAr: value.nameAr ?? null,
        slug: value.slug,
        active: value.isActive,
        parentId: value.parentId ? Number(value.parentId) : null,
        parentName: value.parentName,
      }
    : null;
}

async function productDetails(
  productId: number,
  product: Awaited<ReturnType<typeof readProductMutationPayload>>,
  archivedAt: string | null,
) {
  const [brand, category] = await Promise.all([
    product.brandId ? readBrand(product.brandId) : Promise.resolve(null),
    product.categoryId ? readCategory(product.categoryId) : Promise.resolve(null),
  ]);

  return {
    id: productId,
    archivedAt,
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
      brand: taxonomyBrand(brand),
      category: taxonomyCategory(category),
      assignedBrandId: product.brandId,
      assignedCategoryId: product.categoryId,
    },
    content: {
      description: product.description,
      descriptionAr: product.descriptionAr,
      images: product.images,
    },
  };
}

async function inspectProduct(productId: number) {
  const product = await readProductMutationPayload(getDb(), productId);
  return productDetails(productId, product, null);
}

async function inspectArchivedProduct(productId: number) {
  const archived = await readArchivedProductMutationPayload(getDb(), productId);
  return productDetails(productId, archived.product, archived.archivedAt);
}

export async function inspectAdminCatalogProducts(
  raw: z.input<typeof adminAiCatalogProductInspectionSchema>,
) {
  const input = adminAiCatalogProductInspectionSchema.parse(raw);
  const requestedIds = [...new Set(input.productIds)];
  const inspected = await Promise.all(
    requestedIds.map(async (productId) => {
      try {
        return { productId, item: await inspectProduct(productId) } as const;
      } catch (error) {
        if (error instanceof ProductMutationNotFoundError) {
          return { productId, item: null } as const;
        }
        throw error;
      }
    }),
  );

  return {
    kind: 'catalog_products' as const,
    requestedIds,
    missingIds: inspected.flatMap(({ productId, item }) => (item ? [] : [productId])),
    items: inspected.flatMap(({ item }) => (item ? [item] : [])),
  };
}

export async function inspectAdminArchivedCatalogProducts(
  raw: z.input<typeof adminAiArchivedCatalogProductInspectionSchema>,
) {
  const input = adminAiArchivedCatalogProductInspectionSchema.parse(raw);
  const requestedIds = [...new Set(input.productIds)];
  const inspected = await Promise.all(
    requestedIds.map(async (productId) => {
      try {
        return { productId, item: await inspectArchivedProduct(productId) } as const;
      } catch (error) {
        if (error instanceof ProductMutationNotFoundError) {
          return { productId, item: null } as const;
        }
        throw error;
      }
    }),
  );

  return {
    kind: 'archived_catalog_products' as const,
    requestedIds,
    missingIds: inspected.flatMap(({ productId, item }) => (item ? [] : [productId])),
    items: inspected.flatMap(({ item }) => (item ? [item] : [])),
  };
}
