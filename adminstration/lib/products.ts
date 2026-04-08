import { z } from 'zod';

const nullableText = z.string().trim().optional().nullable();
const nullableNumber = z.coerce.number().min(0).optional().nullable();

export const productPayloadSchema = z.object({
  title: z.string().trim().min(1),
  slug: z.string().trim().max(180).optional().nullable().transform((value) => {
    const normalized = value?.trim() ?? '';
    return normalized.length > 0 ? normalized : null;
  }),
  titleAr: nullableText,
  description: nullableText,
  descriptionAr: nullableText,
  sku: nullableText,
  barcode: nullableText,

  price: z.coerce.number().min(0),
  oldPrice: nullableNumber,
  purchasePrice: nullableNumber,

  active: z.boolean().default(true),
  inStock: z.boolean().default(true),
  availabilityStatus: z.enum(['in_stock', 'out_of_stock']).default('in_stock'),

  inventoryQuantity: z.coerce.number().int().min(0).default(0),

  brandId: z.coerce.number().int().positive().optional().nullable(),
  categoryId: z.coerce.number().int().positive().optional().nullable(),
  images: z.array(z.string().trim().url()).default([]),
});

export type ProductPayloadInput = z.input<typeof productPayloadSchema>;
export type ProductPayload = z.output<typeof productPayloadSchema>;

export const productPatchSchema = z.object({
  active: z.boolean().optional(),
  inStock: z.boolean().optional(),
}).refine((value) => value.active !== undefined || value.inStock !== undefined, {
  message: 'At least one product field must be updated.',
});

export type ProductPatchInput = z.input<typeof productPatchSchema>;
export type ProductPatch = z.output<typeof productPatchSchema>;

export const productSortKeyValues = ['active', 'title', 'price', 'purchasePrice', 'inStock', 'updatedAt', 'createdAt'] as const;
export const sortDirectionValues = ['asc', 'desc'] as const;
export const imageOriginFilterValues = ['all', 'external'] as const;

const optionalNumericFilter = z.union([z.coerce.number().int().positive(), z.literal(''), z.null(), z.undefined()]).transform((value) => {
  if (value === '' || value == null) {
    return null;
  }

  return value;
});

export const productListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  search: z.string().trim().default(''),
  brandId: optionalNumericFilter,
  categoryId: optionalNumericFilter,
  imageOrigin: z.enum(imageOriginFilterValues).default('all'),
  sortKey: z.enum(productSortKeyValues).default('updatedAt'),
  sortDirection: z.enum(sortDirectionValues).default('desc'),
});

export type ProductRecord = ProductPayload & {
  id: number;
  createdAt: string;
  updatedAt: string;
};

export type ProductSortKey = z.infer<typeof productListQuerySchema>['sortKey'];
export type SortDirection = z.infer<typeof productListQuerySchema>['sortDirection'];
