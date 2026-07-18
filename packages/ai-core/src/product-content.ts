import { generateText, Output } from 'ai';
import { z } from 'zod';

import { createOpenAiResponsesModel, getAiConfig, type AiConfig } from './config';

export const productContentFieldSchema = z.enum(['title', 'titleAr', 'description', 'descriptionAr']);
export const productContentChangesSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  titleAr: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().min(1).max(5_000).optional(),
  descriptionAr: z.string().trim().min(1).max(5_000).optional(),
}).refine((changes) => Object.keys(changes).length > 0, 'At least one content change is required.');

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

export interface ProductContentGenerator {
  generate(input: ProductContentGenerationInput): Promise<{
    changes: ProductContentChanges;
    reasoning: string;
    usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
    model: string;
  }>;
}

const generatedContentSchema = z.object({
  changes: productContentChangesSchema,
  reasoning: z.string().trim().min(1).max(2_000),
});

export function createProductContentGenerator(config: AiConfig = getAiConfig()): ProductContentGenerator {
  return {
    async generate(rawInput) {
      const input = productContentGenerationInputSchema.parse(rawInput);
      const allowedFields = new Set(input.fields);
      const result = await generateText({
        model: createOpenAiResponsesModel(config, 'content'),
        instructions: [
          'Draft factual ecommerce content for a hardware and building-materials catalog.',
          'Use only supplied facts. Do not invent dimensions, certifications, compatibility, materials, or performance claims.',
          'Return only requested fields. Use clear French for title and description fields and Arabic for fields ending in Ar.',
          'If evidence is insufficient, keep wording generic and explain the limitation.',
        ].join(' '),
        prompt: JSON.stringify(input),
        output: Output.object({ schema: generatedContentSchema, name: 'product_content_proposal' }),
        maxRetries: config.maxRetries,
        timeout: config.requestTimeoutMs,
      });
      const generated = await result.output;
      const filtered = Object.fromEntries(
        Object.entries(generated.changes).filter(([field]) => allowedFields.has(field as z.infer<typeof productContentFieldSchema>)),
      );

      return {
        changes: productContentChangesSchema.parse(filtered),
        reasoning: generated.reasoning,
        usage: result.usage,
        model: config.contentModel ?? '',
      };
    },
  };
}
