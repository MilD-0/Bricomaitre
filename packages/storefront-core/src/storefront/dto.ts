import { assetBanners, brands, categories, featuredProductGroups, productCards, products } from '../../../db/src/schema';
import type { EcotrackCatalogRecord } from '../ecotrack-support';
import { toStorefrontOrderRecord } from '../order-records';
import type { OrderStatusHistoryRecord } from '../orders-support';

export type StorefrontProductDtoRow = Pick<
  typeof products.$inferSelect,
  | 'id'
  | 'slug'
  | 'title'
  | 'titleAr'
  | 'description'
  | 'descriptionAr'
  | 'sku'
  | 'barcode'
  | 'price'
  | 'oldPrice'
  | 'active'
  | 'inStock'
  | 'availabilityStatus'
  | 'inventoryQuantity'
  | 'brandId'
  | 'categoryId'
  | 'images'
  | 'createdAt'
  | 'updatedAt'
>;

export function toStorefrontProductDto(row: StorefrontProductDtoRow) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    titleAr: row.titleAr,
    description: row.description,
    descriptionAr: row.descriptionAr,
    sku: row.sku,
    barcode: row.barcode,
    price: row.price,
    oldPrice: row.oldPrice,
    active: row.active,
    inStock: row.inStock,
    availabilityStatus: row.availabilityStatus,
    inventoryQuantity: row.inventoryQuantity,
    brandId: row.brandId,
    categoryId: row.categoryId,
    images: row.images,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toStorefrontBrandDto(row: Pick<typeof brands.$inferSelect, 'id' | 'name' | 'slug' | 'image' | 'featured' | 'createdAt' | 'updatedAt'>) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toStorefrontCategoryDto(
  row: Pick<typeof categories.$inferSelect, 'id' | 'name' | 'slug' | 'nameEn' | 'nameAr' | 'image' | 'parentId' | 'properties' | 'featured' | 'createdAt' | 'updatedAt'>,
) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toStorefrontBannerDto(row: typeof assetBanners.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toStorefrontFeaturedGroupDto(
  row: typeof featuredProductGroups.$inferSelect & {
    productIds: number[];
    brandIds: number[];
    categoryIds: number[];
  },
) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toStorefrontProductCardDto(row: typeof productCards.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toStorefrontEcotrackCatalogDto(catalog: EcotrackCatalogRecord) {
  return {
    wilayas: catalog.wilayas,
    communes: catalog.communes,
    serviceFees: catalog.serviceFees,
    weightFees: catalog.weightFees,
    lastSync: catalog.lastSync,
  };
}

export function toStorefrontOrderDto(
  row: Parameters<typeof toStorefrontOrderRecord>[0],
  history: OrderStatusHistoryRecord[],
  productLookup: Parameters<typeof toStorefrontOrderRecord>[2],
) {
  return toStorefrontOrderRecord(row, history, productLookup);
}
