import { z } from 'zod';

export const STOREFRONT_ANALYTICS_PROJECT = 'storefront' as const;

export const storefrontRevalidationRequestSchema = z.object({
  scope: z.enum(['assets', 'products', 'product-meta', 'settings', 'landing-pages']),
  tokens: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
});

export const isoTimestampSchema = z.string().datetime({ offset: true });

export const productSortKeyValues = [
  'recommended',
  'title',
  'price',
  'inStock',
  'updatedAt',
  'createdAt',
] as const;

export const sortDirectionValues = ['asc', 'desc'] as const;

export const optionalNumericFilter = z
  .union([z.coerce.number().int().positive(), z.literal(''), z.null()])
  .optional()
  .transform((value) => {
    if (value === '' || value == null) {
      return null;
    }

    return value;
  });

export const optionalBooleanFilter = z
  .union([
    z.literal('1'),
    z.literal('true'),
    z.literal(true),
    z.literal(false),
    z.literal(''),
    z.null(),
  ])
  .optional()
  .transform((value) => value === '1' || value === 'true' || value === true);

export const optionalPriceFilter = z
  .union([z.literal(''), z.null(), z.coerce.number().nonnegative()])
  .optional()
  .transform((value) => (value === '' || value == null ? null : value));
