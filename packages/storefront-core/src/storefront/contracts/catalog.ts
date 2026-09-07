import { z } from 'zod';
import { productPromosSchema } from '../../orders-support';
import {
  isoTimestampSchema,
  optionalBooleanFilter,
  optionalNumericFilter,
  optionalPriceFilter,
  productSortKeyValues,
  sortDirectionValues,
} from './primitives';

export const storefrontProductListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  search: z.string().trim().default(''),
  brandId: optionalNumericFilter,
  categoryId: optionalNumericFilter,
  sortKey: z.enum(productSortKeyValues).default('updatedAt'),
  sortDirection: z.enum(sortDirectionValues).default('desc'),
  discounted: optionalBooleanFilter.default(false),
  stock: z.enum(['all', 'in', 'out']).default('all'),
  minPrice: optionalPriceFilter,
  maxPrice: optionalPriceFilter,
  id: optionalNumericFilter,
  mongoId: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value) => {
      if (value == null) {
        return null;
      }

      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }),
  slug: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value) => {
      if (value == null) {
        return null;
      }

      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }),
});

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
  inStock: z.boolean(),
  availabilityStatus: z.string(),
  brandId: z.number().int().nullable(),
  categoryId: z.number().int().nullable(),
  images: z.array(z.string()),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export const storefrontCatalogCardSchema = storefrontProductResponseItemSchema.omit({
  description: true,
  descriptionAr: true,
  sku: true,
  barcode: true,
  createdAt: true,
  updatedAt: true,
});

export const storefrontProductBuildFeedItemSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().nullable(),
  mongoId: z.string().nullable(),
  updatedAt: isoTimestampSchema,
});

export const storefrontProductBuildFeedResponseSchema = z.object({
  items: z.array(storefrontProductBuildFeedItemSchema),
});

export type StorefrontProductBuildFeedItem = z.infer<typeof storefrontProductBuildFeedItemSchema>;

export const storefrontProductsResponseSchema = z.object({
  items: z.array(storefrontProductResponseItemSchema),
  total: z.number().int().nonnegative(),
});

export const storefrontCartValidationRequestSchema = z.object({
  productIds: z.array(z.number().int().positive()).min(1).max(50),
  productPromos: productPromosSchema.optional(),
  promoCode: z.string().trim().min(1).max(120).nullable().optional(),
});

export const storefrontCartValidationResponseSchema = z.object({
  promos: z
    .array(
      z.object({
        code: z.string(),
        productId: z.number().int().positive(),
        promoPrice: z.number().nonnegative(),
      }),
    )
    .optional(),
  items: z.array(storefrontProductResponseItemSchema),
  promo: z
    .object({
      code: z.string(),
      productId: z.number().int().positive(),
      promoPrice: z.number().nonnegative(),
    })
    .nullable()
    .optional(),
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
  }),
  media: z.array(
    z.object({
      url: z.string().min(1),
      position: z.number().int().min(0),
      width: z.number().int().positive().nullable(),
      height: z.number().int().positive().nullable(),
      blurDataUrl: z.string().nullable(),
    }),
  ),
  brand: z
    .object({
      id: z.number().int().positive(),
      name: z.string(),
      slug: z.string(),
      image: z.string().nullable(),
    })
    .nullable(),
  category: z
    .object({
      id: z.number().int().positive(),
      name: z.string(),
      nameAr: z.string().nullable(),
      slug: z.string(),
      image: z.string().nullable(),
      parentId: z.number().int().positive().nullable(),
      properties: z.array(z.unknown()),
    })
    .nullable(),
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
  productCount: z.number().int().nonnegative().default(0),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export const storefrontCategoriesResponseSchema = z.object({
  items: z.array(storefrontCategoryResponseItemSchema),
});

export type StorefrontProductListQuery = z.infer<typeof storefrontProductListQuerySchema>;

export type StorefrontProductListQueryInput = z.input<typeof storefrontProductListQuerySchema>;

export type StorefrontProductsResponse = z.infer<typeof storefrontProductsResponseSchema>;

export type StorefrontCartValidationResponse = z.infer<
  typeof storefrontCartValidationResponseSchema
>;

export type StorefrontBrandsResponse = z.infer<typeof storefrontBrandsResponseSchema>;

export type StorefrontCategoriesResponse = z.infer<typeof storefrontCategoriesResponseSchema>;

export type StorefrontProductDetailResponse = z.infer<typeof storefrontProductDetailResponseSchema>;
