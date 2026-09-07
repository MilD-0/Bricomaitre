import type { getDb } from '@bric/db/client';
import { products } from '@bric/db/schema';

export type Database = ReturnType<typeof getDb>;

export const productSelection = {
  id: products.id,
  slug: products.slug,
  mongoId: products.mongoId,
  title: products.title,
  titleAr: products.titleAr,
  description: products.description,
  descriptionAr: products.descriptionAr,
  sku: products.sku,
  barcode: products.barcode,
  price: products.price,
  oldPrice: products.oldPrice,
  inStock: products.inStock,
  availabilityStatus: products.availabilityStatus,
  brandId: products.brandId,
  categoryId: products.categoryId,
  images: products.images,
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,
};
