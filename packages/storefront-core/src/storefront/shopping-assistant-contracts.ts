import { z } from 'zod';

export const shoppingAssistantLocaleSchema = z.enum(['fr', 'ar']);

export const shoppingAssistantMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(1_500),
}).strict();

export const shoppingAssistantRequestSchema = z.object({
  locale: shoppingAssistantLocaleSchema,
  messages: z.array(shoppingAssistantMessageSchema).min(1).max(8),
}).strict();

export const shoppingAssistantProductSchema = z.object({
  id: z.number().int().positive(),
  token: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1),
  titleAr: z.string().nullable(),
  description: z.string().nullable(),
  descriptionAr: z.string().nullable(),
  price: z.string().nullable(),
  oldPrice: z.string().nullable(),
  inStock: z.boolean(),
  availabilityStatus: z.string(),
  imageUrl: z.string().nullable(),
  brand: z.string().nullable(),
  category: z.string().nullable(),
}).strict();

export const shoppingAssistantResponseSchema = z.object({
  message: z.string().trim().min(1).max(4_000),
  products: z.array(shoppingAssistantProductSchema).max(8),
  mode: z.enum(['ai', 'fallback']),
}).strict();

export const shoppingAssistantCatalogSearchSchema = z.object({
  query: z.string().trim().min(1).max(160),
  inStockOnly: z.boolean().default(true),
  limit: z.number().int().min(1).max(8).default(5),
}).strict();

export const shoppingAssistantProductLookupSchema = z.object({
  tokens: z.array(z.string().trim().min(1).max(200)).min(1).max(4),
}).strict();

export type ShoppingAssistantRequest = z.infer<typeof shoppingAssistantRequestSchema>;
export type ShoppingAssistantProduct = z.infer<typeof shoppingAssistantProductSchema>;
export type ShoppingAssistantResponse = z.infer<typeof shoppingAssistantResponseSchema>;
