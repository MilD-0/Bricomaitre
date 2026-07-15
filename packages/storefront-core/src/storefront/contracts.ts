import { z } from 'zod';

import { productListQuerySchema } from '../products-support';
import {
  deliveryTypeSchema,
  orderStatusSchema,
  storefrontOrderCreateSchema,
  storefrontOrderPatchSchema,
} from '../orders-support';
import {
  storefrontOrderMetaResponseSchema,
  storefrontOrderMetaSchema,
} from './meta-contracts';

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

export const storefrontOrderCreateRequestSchema = storefrontOrderCreateSchema.extend({
  meta: storefrontOrderMetaSchema.optional(),
});
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
  total: z.number().int().nonnegative(),
});

export const storefrontProductTokenSchema = z.string().trim().min(1).max(200);

export const storefrontProductDetailResponseItemSchema = z.object({
  id: z.number().int().positive(),
  canonicalToken: z.string().min(1),
  title: z.string(),
  titleAr: z.string().nullable(),
  description: z.string().nullable(),
  descriptionAr: z.string().nullable(),
  sku: z.string().nullable(),
  barcode: z.string().nullable(),
  price: z.string(),
  oldPrice: z.string().nullable(),
  availability: z.object({
    status: z.string(),
    inStock: z.boolean(),
    quantity: z.number().int(),
  }),
  media: z.array(z.object({
    url: z.string().min(1),
    position: z.number().int().min(0),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    blurDataUrl: z.string().nullable(),
  })),
  brand: z.object({
    id: z.number().int().positive(),
    name: z.string(),
    slug: z.string(),
    image: z.string().nullable(),
  }).nullable(),
  category: z.object({
    id: z.number().int().positive(),
    name: z.string(),
    nameAr: z.string().nullable(),
    slug: z.string(),
    image: z.string().nullable(),
    parentId: z.number().int().positive().nullable(),
    properties: z.array(z.unknown()),
  }).nullable(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export const storefrontProductDetailResponseSchema = z.object({
  item: storefrontProductDetailResponseItemSchema,
  resolution: z.object({
    requestedToken: storefrontProductTokenSchema,
    matchedBy: z.enum(['slug', 'mongoId', 'id']),
    canonicalToken: z.string().min(1),
  }),
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
  banners: z.array(z.object({
    id: z.number().int().positive(),
    title: z.string(),
    titleAr: z.string().nullable(),
    imageUrl: z.string(),
    imageUrlPortrait: z.string().nullable(),
    imageUrlLandscape: z.string().nullable(),
    productId: z.number().int().positive().nullable(),
    sortOrder: z.number().int(),
    active: z.boolean(),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })),
  featuredGroups: z.array(z.object({
    id: z.number().int().positive(),
    name: z.string(),
    nameAr: z.string().nullable(),
    cta: z.string().nullable(),
    ctaAr: z.string().nullable(),
    link: z.string().nullable(),
    sortOrder: z.number().int(),
    showAtTopOfProductsPage: z.boolean(),
    active: z.boolean(),
    productIds: z.array(z.number().int()),
    brandIds: z.array(z.number().int()),
    categoryIds: z.array(z.number().int()),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })),
  productCards: z.array(z.object({
    id: z.number().int().positive(),
    productId: z.number().int().positive(),
    titleAr: z.string(),
    titleFr: z.string(),
    descriptionAr: z.string(),
    descriptionFr: z.string(),
    characteristicsAr: z.array(z.string()),
    characteristicsFr: z.array(z.string()),
    sortOrder: z.number().int(),
    active: z.boolean(),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })),
});

export const storefrontHomepageResponseSchema = z.object({
  banners: storefrontAssetsResponseSchema.shape.banners,
  topProducts: z.array(storefrontProductResponseItemSchema),
  categories: z.array(storefrontCategoryResponseItemSchema),
  productCards: z.array(storefrontAssetsResponseSchema.shape.productCards.element.extend({
    product: storefrontProductResponseItemSchema,
  })),
  brands: z.array(storefrontBrandResponseItemSchema),
  featuredGroups: z.array(storefrontAssetsResponseSchema.shape.featuredGroups.element.extend({
    products: z.array(storefrontProductResponseItemSchema),
  })),
});

export const storefrontEcotrackCatalogResponseSchema = z.object({
  wilayas: z.array(z.object({
    wilayaId: z.number().int().positive(),
    name: z.string(),
  })),
  communes: z.array(z.object({
    // Ecotrack's source data includes the valid external commune identifier 0
    // (Abadla, Wilaya 08), so this must accept a non-negative external id.
    communeId: z.number().int().nonnegative(),
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
  promoCode: z.string().nullable().default(null),
  promoProductId: z.number().int().positive().nullable().default(null),
  promoOriginalSubtotal: z.number().nullable().default(null),
  promoDiscountAmount: z.number().default(0),
  promoFinalSubtotal: z.number().nullable().default(null),
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
  meta: storefrontOrderMetaResponseSchema.optional(),
});

export const storefrontReadOrderResponseSchema = z.object({
  item: storefrontOrderResponseItemSchema,
});

export const storefrontPatchOrderResponseSchema = z.object({
  ok: z.literal(true),
  item: storefrontOrderResponseItemSchema,
});

export const storefrontProductPromoResponseSchema = z.object({
  ok: z.boolean(),
  promo: z.object({
    code: z.string(),
    productId: z.number().int().positive(),
    originalPrice: z.number(),
    promoPrice: z.number(),
    discountAmount: z.number(),
  }).nullable(),
});

export type StorefrontProductListQuery = z.infer<typeof storefrontProductListQuerySchema>;
export type StorefrontProductsResponse = z.infer<typeof storefrontProductsResponseSchema>;
export type StorefrontBrandsResponse = z.infer<typeof storefrontBrandsResponseSchema>;
export type StorefrontCategoriesResponse = z.infer<typeof storefrontCategoriesResponseSchema>;
export type StorefrontAssetsResponse = z.infer<typeof storefrontAssetsResponseSchema>;
export type StorefrontHomepageResponse = z.infer<typeof storefrontHomepageResponseSchema>;
export type StorefrontEcotrackCatalogResponse = z.infer<typeof storefrontEcotrackCatalogResponseSchema>;
export type StorefrontProductDetailResponse = z.infer<typeof storefrontProductDetailResponseSchema>;
export type StorefrontOrderCreateRequest = z.infer<typeof storefrontOrderCreateRequestSchema>;
export type StorefrontOrderPatchRequest = z.infer<typeof storefrontOrderPatchRequestSchema>;
