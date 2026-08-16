import { z } from 'zod';

import { parseSortRuleStrings, type SortRule } from './multi-sort';

const nullableText = z.string().trim().optional().nullable();
const nullableNumber = z.coerce.number().min(0).optional().nullable();
const nullableDateText = z.union([z.string(), z.null(), z.undefined()]).transform((value) => {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
});

export function normalizePromoCode(value: string) {
  return value.trim().toLowerCase();
}

const productPromoCodePayloadSchema = z.object({
  code: z.string().trim().min(1).max(120),
  promoPrice: z.coerce.number().min(0),
  active: z.boolean().default(true),
  startsAt: nullableDateText,
  endsAt: nullableDateText,
});

export const productPayloadSchema = z
  .object({
    title: z.string().trim().min(1),
    slug: z
      .string()
      .trim()
      .max(180)
      .optional()
      .nullable()
      .transform((value) => {
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
    promoCodes: z.array(productPromoCodePayloadSchema).default([]),
  })
  .superRefine((value, ctx) => {
    const seenCodes = new Set<string>();

    value.promoCodes.forEach((promo, index) => {
      const normalizedCode = normalizePromoCode(promo.code);
      if (seenCodes.has(normalizedCode)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Promo codes must be unique per product.',
          path: ['promoCodes', index, 'code'],
        });
      }
      seenCodes.add(normalizedCode);

      if (promo.active && promo.promoPrice >= value.price) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Active promo price must be lower than the product price.',
          path: ['promoCodes', index, 'promoPrice'],
        });
      }

      if (promo.startsAt && Number.isNaN(Date.parse(promo.startsAt))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Start date must be a valid date.',
          path: ['promoCodes', index, 'startsAt'],
        });
      }

      if (promo.endsAt && Number.isNaN(Date.parse(promo.endsAt))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'End date must be a valid date.',
          path: ['promoCodes', index, 'endsAt'],
        });
      }
    });
  });

export type ProductPayloadInput = z.input<typeof productPayloadSchema>;
export type ProductPayload = z.output<typeof productPayloadSchema>;
export type ProductPromoCodePayload = z.output<typeof productPromoCodePayloadSchema>;

export const productPatchSchema = z
  .object({
    active: z.boolean().optional(),
    inStock: z.boolean().optional(),
  })
  .refine((value) => value.active !== undefined || value.inStock !== undefined, {
    message: 'At least one product field must be updated.',
  });

export type ProductPatch = z.output<typeof productPatchSchema>;

const productSortKeyValues = [
  'active',
  'title',
  'price',
  'purchasePrice',
  'inStock',
  'updatedAt',
  'createdAt',
] as const;
const sortDirectionValues = ['asc', 'desc'] as const;
export const imageOriginFilterValues = ['all', 'external'] as const;

const optionalNumericFilter = z
  .union([z.coerce.number().int().positive(), z.literal(''), z.null()])
  .optional()
  .transform((value) => {
    if (value === '' || value == null) {
      return null;
    }

    return value;
  });

export const productListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(50),
    search: z.string().trim().default(''),
    brandId: optionalNumericFilter,
    categoryId: optionalNumericFilter,
    imageOrigin: z.enum(imageOriginFilterValues).default('all'),
    sort: z.array(z.string().trim()).optional().default([]),
    sortKey: z.enum(productSortKeyValues).default('updatedAt'),
    sortDirection: z.enum(sortDirectionValues).default('desc'),
  })
  .transform((value, ctx) => {
    const parsedSortRules = parseSortRuleStrings(value.sort, productSortKeyValues);

    if (!parsedSortRules.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: parsedSortRules.issue,
        path: ['sort'],
      });

      return z.NEVER;
    }

    return {
      ...value,
      sortRules:
        parsedSortRules.rules.length > 0
          ? parsedSortRules.rules
          : [{ key: value.sortKey, direction: value.sortDirection }],
    };
  });

export type ProductRecord = Omit<ProductPayload, 'promoCodes'> & {
  id: number;
  createdAt: string;
  updatedAt: string;
  promoCodes?: ProductPromoCodePayload[];
  orderPurchaseCount: number;
  confirmedOrderCount: number;
  confirmationRate: number | null;
};

export type ProductSortKey = z.infer<typeof productListQuerySchema>['sortKey'];
export type ProductSortRule = SortRule<ProductSortKey>;
