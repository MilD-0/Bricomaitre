import { z } from 'zod';

import { productListQuerySchema } from '../products-support';
import {
  deliveryTypeSchema,
  orderStatusSchema,
  storefrontOrderCreateSchema,
  storefrontOrderPatchSchema,
} from '../orders-support';

const isoTimestampSchema = z.string().datetime({ offset: true });
const optionalNumericFilter = z.union([z.coerce.number().int().positive(), z.literal(''), z.null(), z.undefined()]).transform((value) => {
  if (value === '' || value == null) {
    return null;
  }

  return value;
});

export const storefrontProductListQuerySchema = productListQuerySchema.extend({
  id: optionalNumericFilter,
  mongoId: z.string().trim().optional().nullable().transform((value) => {
    if (value == null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }),
  slug: z.string().trim().optional().nullable().transform((value) => {
    if (value == null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }),
});

export const storefrontOrderCreateRequestSchema = storefrontOrderCreateSchema;
export const storefrontOrderPatchRequestSchema = storefrontOrderPatchSchema;

export const storefrontProductResponseItemSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().nullable(),
  mongoId: z.string().nullable(),
  title: z.string(),
  titleAr: z.string().nullable(),
  description: z.string().nullable(),
  descriptionAr: z.string().nullable(),
  sku: z.string().nullable(),
  barcode: z.string().nullable(),
  price: z.string().nullable(),
  oldPrice: z.string().nullable(),
  active: z.boolean(),
  inStock: z.boolean(),
  availabilityStatus: z.string(),
  inventoryQuantity: z.number().int(),
  brandId: z.number().int().nullable(),
  categoryId: z.number().int().nullable(),
  images: z.array(z.string()),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export const storefrontProductsResponseSchema = z.object({
  items: z.array(storefrontProductResponseItemSchema),
});

export const storefrontBrandResponseItemSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  slug: z.string().nullable(),
  image: z.string().nullable(),
  featured: z.boolean(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export const storefrontBrandsResponseSchema = z.object({
  items: z.array(storefrontBrandResponseItemSchema),
});

export const storefrontCategoryResponseItemSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  slug: z.string().nullable(),
  nameEn: z.string().nullable(),
  nameAr: z.string().nullable(),
  image: z.string().nullable(),
  parentId: z.number().int().nullable(),
  properties: z.array(z.unknown()),
  featured: z.boolean(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export const storefrontCategoriesResponseSchema = z.object({
  items: z.array(storefrontCategoryResponseItemSchema),
});

export const storefrontAssetsResponseSchema = z.object({
  banners: z.array(z.object({}).passthrough()),
  featuredGroups: z.array(z.object({
    cta: z.string().nullable(),
    ctaAr: z.string().nullable(),
    link: z.string().nullable(),
    productIds: z.array(z.number().int()),
    brandIds: z.array(z.number().int()),
    categoryIds: z.array(z.number().int()),
  }).passthrough()),
  productCards: z.array(z.object({}).passthrough()),
});

export const storefrontEcotrackCatalogResponseSchema = z.object({
  wilayas: z.array(z.object({
    wilayaId: z.number().int().positive(),
    name: z.string(),
  })),
  communes: z.array(z.object({
    communeId: z.number().int().positive(),
    wilayaId: z.number().int().positive(),
    name: z.string(),
    postalCode: z.string().nullable(),
    hasStopDesk: z.boolean(),
  })),
  serviceFees: z.array(z.object({
    serviceType: z.string(),
    wilayaId: z.number().int().positive(),
    homeFee: z.string(),
    stopDeskFee: z.string(),
  })),
  weightFees: z.array(z.object({
    serviceType: z.string(),
    homeSurcharge: z.string(),
    stopDeskSurcharge: z.string(),
    perAdditionalKg: z.string(),
    startsAtKg: z.string(),
  })),
  lastSync: z.object({}).passthrough().nullable(),
});

export const storefrontOrderStatusHistorySchema = z.object({
  id: z.number().int().positive(),
  status: orderStatusSchema,
  noAnswerCount: z.number().int().min(0),
  changedAt: isoTimestampSchema,
});

export const storefrontOrderResponseItemSchema = z.object({
  id: z.number().int().positive(),
  publicToken: z.string().nullable(),
  variant: z.string().nullable().optional(),
  isDegradedCapture: z.boolean().optional(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  fullName: z.string(),
  email: z.string().email().nullable(),
  phoneNumber1: z.string(),
  phoneNumber2: z.string().nullable(),
  cartProducts: z.array(z.string()),
  orderProducts: z.array(z.object({
    productId: z.number().int().positive().nullable(),
    brandId: z.number().int().nullable().optional(),
    rawValue: z.string(),
    title: z.string(),
    unitPrice: z.number(),
    quantity: z.number().int().positive(),
    lineTotal: z.number(),
    thumbnailUrl: z.string().nullable(),
    missing: z.boolean(),
  })),
  delivery: deliveryTypeSchema,
  state: z.number().int().nullable(),
  city: z.string().nullable(),
  homeAddress: z.string().nullable(),
  productSubtotal: z.number(),
  deliveryFee: z.number(),
  totalAmount: z.number(),
  note: z.string().nullable(),
  confirmed: orderStatusSchema,
  noAnswerCount: z.number().int().min(0),
  confirmedAt: isoTimestampSchema.nullable(),
  hasStatusHistory: z.boolean(),
  statusHistory: z.array(storefrontOrderStatusHistorySchema),
});

export const storefrontCreateOrderResponseSchema = z.object({
  ok: z.literal(true),
  item: storefrontOrderResponseItemSchema,
});

export const storefrontReadOrderResponseSchema = z.object({
  item: storefrontOrderResponseItemSchema,
});

export const storefrontPatchOrderResponseSchema = z.object({
  ok: z.literal(true),
  item: storefrontOrderResponseItemSchema,
});

export type StorefrontProductListQuery = z.infer<typeof storefrontProductListQuerySchema>;
export type StorefrontOrderCreateRequest = z.infer<typeof storefrontOrderCreateRequestSchema>;
export type StorefrontOrderPatchRequest = z.infer<typeof storefrontOrderPatchRequestSchema>;
