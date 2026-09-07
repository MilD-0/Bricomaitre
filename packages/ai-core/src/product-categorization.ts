import { generateText, Output } from 'ai';
import { z } from 'zod';

import { createAiLanguageModel, getAiConfig, type AiConfig } from './config';

export const productCategorizationInputSchema = z.object({
  product: z.object({
    id: z.number().int().positive(),
    title: z.string().trim().min(1),
    description: z.string().nullable(),
    brand: z.string().nullable(),
    sku: z.string().nullable(),
    currentCategoryId: z.number().int().positive().nullable(),
    currentCategory: z.string().nullable(),
  }),
  categories: z
    .array(
      z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(1),
        nameAr: z.string().nullable(),
        parentId: z.number().int().positive().nullable(),
        parentName: z.string().nullable(),
      }),
    )
    .min(1),
  adminContext: z.string().trim().max(2_000).optional(),
});

export const productCategorizationDecisionSchema = z
  .object({
    categoryId: z.number().int().positive().nullable(),
    confidence: z.number().min(0).max(1),
    ambiguous: z.boolean(),
    reasoning: z.string().trim().min(1).max(2_000),
  })
  .superRefine((decision, context) => {
    if (decision.ambiguous && decision.categoryId !== null) {
      context.addIssue({
        code: 'custom',
        message: 'Ambiguous decisions cannot select a category.',
        path: ['categoryId'],
      });
    }
    if (!decision.ambiguous && decision.categoryId === null) {
      context.addIssue({
        code: 'custom',
        message: 'Non-ambiguous decisions must select a category.',
        path: ['categoryId'],
      });
    }
  });

export type ProductCategorizationInput = z.infer<typeof productCategorizationInputSchema>;
export type ProductCategorizationDecision = z.infer<typeof productCategorizationDecisionSchema>;

export interface ProductCategorizationClassifier {
  classify(input: ProductCategorizationInput): Promise<{
    decision: ProductCategorizationDecision;
    usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
    model: string;
  }>;
}

export const PRODUCT_CATEGORIZATION_PROMPT_VERSION = 'product-categorization-v1';

export function createProductCategorizationClassifier(
  config: AiConfig = getAiConfig(),
): ProductCategorizationClassifier {
  return {
    async classify(rawInput) {
      const input = productCategorizationInputSchema.parse(rawInput);
      const allowedCategoryIds = new Set(input.categories.map((category) => category.id));
      const result = await generateText({
        model: createAiLanguageModel(config, 'admin'),
        instructions: [
          'Classify one hardware or building-materials catalog product using only the supplied product facts and category candidates.',
          'Select the single most specific appropriate category, considering its parent context.',
          'Return only a categoryId present in the supplied categories.',
          'Do not infer technical properties absent from the title, description, brand, SKU, or administrator context.',
          'If two or more categories remain plausible, or evidence is insufficient, set ambiguous to true, categoryId to null, and explain what is unclear.',
          'Keeping the current category is valid when it is already the best match.',
          'This is a reviewable classification proposal, not an applied database change.',
        ].join(' '),
        prompt: JSON.stringify(input),
        output: Output.object({
          schema: productCategorizationDecisionSchema,
          name: 'product_category_decision',
        }),
        maxRetries: config.maxRetries,
        ...(config.contentRequestTimeoutMs ? { timeout: config.contentRequestTimeoutMs } : {}),
      });
      const decision = productCategorizationDecisionSchema.parse(await result.output);
      if (decision.categoryId !== null && !allowedCategoryIds.has(decision.categoryId)) {
        return {
          decision: {
            categoryId: null,
            confidence: 0,
            ambiguous: true,
            reasoning: 'The model selected a category outside the supplied taxonomy.',
          },
          usage: result.usage,
          model: config.adminModel ?? '',
        };
      }
      return { decision, usage: result.usage, model: config.adminModel ?? '' };
    },
  };
}
