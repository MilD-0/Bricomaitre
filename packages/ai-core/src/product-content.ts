import { generateText, Output } from 'ai';
import { z } from 'zod';

import { createAiLanguageModel, getAiConfig, type AiConfig } from './config';

export const productContentFieldSchema = z.enum([
  'title',
  'titleAr',
  'description',
  'descriptionAr',
]);
export type ProductContentField = z.infer<typeof productContentFieldSchema>;

const productContentValueSchemas: Record<ProductContentField, z.ZodString> = {
  title: z.string().trim().min(1).max(300),
  titleAr: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(5_000),
  descriptionAr: z.string().trim().min(1).max(5_000),
};

export const productContentChangesSchema = z
  .object({
    title: productContentValueSchemas.title.optional(),
    titleAr: productContentValueSchemas.titleAr.optional(),
    description: productContentValueSchemas.description.optional(),
    descriptionAr: productContentValueSchemas.descriptionAr.optional(),
  })
  .refine((changes) => Object.keys(changes).length > 0, 'At least one content change is required.');

export const productContentGenerationInputSchema = z.object({
  product: z.object({
    id: z.number().int().positive(),
    title: z.string().trim().min(1),
    titleAr: z.string().nullable(),
    description: z.string().nullable(),
    descriptionAr: z.string().nullable(),
    category: z.string().nullable(),
    brand: z.string().nullable(),
    sku: z.string().nullable(),
  }),
  fields: z.array(productContentFieldSchema).min(1),
  adminContext: z.string().trim().max(2_000).optional(),
});

export type ProductContentChanges = z.infer<typeof productContentChangesSchema>;
export type ProductContentGenerationInput = z.infer<typeof productContentGenerationInputSchema>;

export function createRequestedProductContentChangesSchema(fields: readonly ProductContentField[]) {
  const shape: Partial<Record<ProductContentField, z.ZodString>> = {};
  for (const field of fields) shape[field] = productContentValueSchemas[field];
  return z.object(shape as Record<ProductContentField, z.ZodString>).strict();
}

export interface ProductContentGenerator {
  generate(input: ProductContentGenerationInput): Promise<{
    changes: ProductContentChanges;
    reasoning: string;
    usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
    model: string;
  }>;
}

export const PRODUCT_CONTENT_GENERATION_INSTRUCTIONS = [
  'Draft factual ecommerce content for a hardware and building-materials catalog.',
  'Use only supplied product facts and administrator context. Administrator context is trusted product evidence for this proposal.',
  'Use an existing French field as the factual source for requested Arabic content, and an existing Arabic field as the factual source for requested French content.',
  'Do not invent dimensions, certifications, compatibility, materials, contents, or performance claims.',
  'Return every requested field exactly once and return no unrequested fields. A response missing any requested field is invalid.',
  'Use clear French for title and description fields and Arabic for fields ending in Ar.',
  'Customer-facing fields must contain usable catalog copy, never meta commentary such as information unavailable, insufficient data, missing description, or translation unavailable.',
  'When evidence is sparse, write concise generic copy supported by the title, category, brand, SKU, and administrator context, and explain any limitation only in reasoning.',
].join(' ');

export function createProductContentGenerator(
  config: AiConfig = getAiConfig(),
): ProductContentGenerator {
  return {
    async generate(rawInput) {
      const input = productContentGenerationInputSchema.parse(rawInput);
      const generatedContentSchema = z.object({
        changes: createRequestedProductContentChangesSchema(input.fields),
        reasoning: z.string().trim().min(1).max(2_000),
      });
      const result = await generateText({
        model: createAiLanguageModel(config, 'content'),
        instructions: PRODUCT_CONTENT_GENERATION_INSTRUCTIONS,
        prompt: JSON.stringify(input),
        output: Output.object({ schema: generatedContentSchema, name: 'product_content_proposal' }),
        maxRetries: config.maxRetries,
        timeout: config.requestTimeoutMs,
      });
      const generated = await result.output;

      return {
        changes: productContentChangesSchema.parse(generated.changes),
        reasoning: generated.reasoning,
        usage: result.usage,
        model: config.contentModel ?? '',
      };
    },
  };
}
