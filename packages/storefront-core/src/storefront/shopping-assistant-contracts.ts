import { z } from 'zod';

export const shoppingAssistantLocaleSchema = z.enum(['fr', 'ar']);

export const shoppingAssistantMessageSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(1_500),
    productIds: z.array(z.number().int().positive()).max(8).optional(),
  })
  .strict();

const nullablePositiveIntegerSchema = z.number().int().positive().nullable().default(null);
const nullablePriceSchema = z.number().nonnegative().nullable().default(null);

export const shoppingAssistantCatalogSearchSchema = z
  .object({
    search: z.string().trim().max(160).default(''),
    brandId: nullablePositiveIntegerSchema,
    categoryId: nullablePositiveIntegerSchema,
    discounted: z.boolean().default(false),
    stock: z.enum(['all', 'in', 'out']).default('all'),
    minPrice: nullablePriceSchema,
    maxPrice: nullablePriceSchema,
    sortKey: z
      .enum(['recommended', 'active', 'title', 'price', 'inStock', 'updatedAt', 'createdAt'])
      .default('recommended'),
    sortDirection: z.enum(['asc', 'desc']).default('desc'),
    page: z.number().int().positive().max(10_000).default(1),
    limit: z.number().int().min(1).max(24).default(12),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.minPrice !== null && value.maxPrice !== null && value.minPrice > value.maxPrice) {
      context.addIssue({
        code: 'custom',
        path: ['maxPrice'],
        message: 'maxPrice must be greater than or equal to minPrice',
      });
    }
  });

export const shoppingAssistantPageContextSchema = z
  .object({
    pathname: z.string().trim().min(1).max(2_048),
    currentProductToken: z.string().trim().min(1).max(200).nullable().default(null),
    catalogQuery: shoppingAssistantCatalogSearchSchema.nullable().default(null),
    cartItems: z
      .array(
        z
          .object({
            productId: z.number().int().positive(),
            quantity: z.number().int().min(1).max(20),
          })
          .strict(),
      )
      .max(50)
      .default([]),
  })
  .strict();

export const shoppingAssistantRequestSchema = z
  .object({
    locale: shoppingAssistantLocaleSchema,
    messages: z.array(shoppingAssistantMessageSchema).min(1).max(30),
    context: shoppingAssistantPageContextSchema.optional(),
    telemetry: z
      .object({
        journeyId: z.string().trim().min(1).max(120),
        sessionId: z.string().trim().min(1).max(120),
        pagePath: z.string().trim().min(1).max(2_048),
        intent: z.enum([
          'product_search',
          'product_comparison',
          'compatibility',
          'price',
          'availability',
          'how_to',
          'recommendation',
          'other',
        ]),
      })
      .strict()
      .optional(),
  })
  .strict();

export const shoppingAssistantProductSchema = z
  .object({
    id: z.number().int().positive(),
    token: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1),
    titleAr: z.string().nullable(),
    description: z.string().nullable(),
    descriptionAr: z.string().nullable(),
    sku: z.string().nullable().default(null),
    characteristics: z.array(z.string().trim().min(1).max(300)).max(16).default([]),
    characteristicsAr: z.array(z.string().trim().min(1).max(300)).max(16).default([]),
    price: z.string().nullable(),
    oldPrice: z.string().nullable(),
    inStock: z.boolean(),
    availabilityStatus: z.string(),
    imageUrl: z.string().nullable(),
    brand: z.string().nullable(),
    category: z.string().nullable(),
  })
  .strict();

export const shoppingAssistantResponseSchema = z
  .object({
    message: z.string().trim().min(1).max(4_000),
    products: z.array(shoppingAssistantProductSchema).max(8),
    mode: z.enum(['ai', 'fallback']),
  })
  .strict();

export const shoppingAssistantToolNameSchema = z.enum([
  'search_catalog',
  'inspect_products',
  'present_products',
]);

export const shoppingAssistantStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('status'), status: z.enum(['thinking', 'catalog']) }).strict(),
  z
    .object({
      type: z.literal('tool'),
      name: shoppingAssistantToolNameSchema,
      status: z.enum(['started', 'completed', 'failed']),
    })
    .strict(),
  z.object({ type: z.literal('text-delta'), delta: z.string().min(1).max(4_000) }).strict(),
  z
    .object({
      type: z.literal('result'),
      products: z.array(shoppingAssistantProductSchema).max(8),
      mode: z.enum(['ai', 'fallback']),
    })
    .strict(),
  z.object({ type: z.literal('error'), code: z.literal('assistant_unavailable') }).strict(),
]);

export const shoppingAssistantProductLookupSchema = z
  .object({
    tokens: z.array(z.string().trim().min(1).max(200)).min(1).max(4),
  })
  .strict();

export const shoppingAssistantProductSelectionSchema = z
  .object({
    productIds: z.array(z.number().int().positive()).min(1).max(8),
  })
  .strict();

export const shoppingAssistantCatalogSearchResultSchema = z
  .object({
    products: z.array(shoppingAssistantProductSchema).max(24),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive().max(24),
    hasMore: z.boolean(),
  })
  .strict();

export type ShoppingAssistantRequest = z.infer<typeof shoppingAssistantRequestSchema>;
export type ShoppingAssistantProduct = z.infer<typeof shoppingAssistantProductSchema>;
export type ShoppingAssistantCatalogSearch = z.infer<typeof shoppingAssistantCatalogSearchSchema>;
export type ShoppingAssistantPageContext = z.infer<typeof shoppingAssistantPageContextSchema>;
export type ShoppingAssistantResponse = z.infer<typeof shoppingAssistantResponseSchema>;
export type ShoppingAssistantStreamEvent = z.infer<typeof shoppingAssistantStreamEventSchema>;
