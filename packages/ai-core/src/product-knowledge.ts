import { generateText, Output } from 'ai';
import { z } from 'zod';

import { createOpenAiResponsesModel, getAiConfig, type AiConfig } from './config';

export const knowledgeSourceSchema = z.enum([
  'manufacturer', 'admin', 'algorithm', 'ai', 'customer_behavior',
]);
export const knowledgeReviewStatusSchema = z.enum([
  'proposed', 'verified', 'rejected', 'expired',
]);
export const productRelationTypeSchema = z.enum([
  'compatible_with', 'requires', 'alternative_to', 'accessory_for', 'frequently_bought_with',
]);

export const productRelationProposalSchema = z.object({
  sourceProductId: z.number().int().positive(),
  targetProductId: z.number().int().positive(),
  relationType: productRelationTypeSchema,
  source: knowledgeSourceSchema,
  confidence: z.number().min(0).max(1).optional().nullable(),
  reviewStatus: knowledgeReviewStatusSchema.default('proposed'),
  evidenceSummary: z.string().trim().min(1).max(2_000).optional().nullable(),
}).superRefine((value, context) => {
  if (value.sourceProductId === value.targetProductId) {
    context.addIssue({ code: 'custom', message: 'A product cannot be related to itself.', path: ['targetProductId'] });
  }
  if ((value.source === 'ai' || value.source === 'algorithm') && value.reviewStatus === 'verified') {
    context.addIssue({ code: 'custom', message: 'Generated relationships must be reviewed before they can be verified.', path: ['reviewStatus'] });
  }
  if (value.source === 'ai' && !value.evidenceSummary) {
    context.addIssue({ code: 'custom', message: 'AI relationship proposals must include evidence.', path: ['evidenceSummary'] });
  }
});

const generatedRelationSchema = z.object({
  relationType: productRelationTypeSchema,
  confidence: z.number().min(0).max(1),
  evidenceSummary: z.string().trim().min(1).max(2_000),
  reasoning: z.string().trim().min(1).max(2_000),
});

export const productRelationGenerationInputSchema = z.object({
  sourceProduct: z.object({
    id: z.number().int().positive(),
    title: z.string().trim().min(1),
    description: z.string().nullable(),
    category: z.string().nullable(),
    brand: z.string().nullable(),
  }),
  targetProduct: z.object({
    id: z.number().int().positive(),
    title: z.string().trim().min(1),
    description: z.string().nullable(),
    category: z.string().nullable(),
    brand: z.string().nullable(),
  }),
  adminContext: z.string().trim().max(2_000).optional(),
});

export type ProductRelationGenerationInput = z.infer<typeof productRelationGenerationInputSchema>;
export type ProductRelationProposal = z.infer<typeof productRelationProposalSchema>;

export interface ProductRelationGenerator {
  generate(input: ProductRelationGenerationInput): Promise<{
    proposal: ProductRelationProposal;
    reasoning: string;
    usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
    model: string;
  }>;
}

export function createProductRelationGenerator(config: AiConfig = getAiConfig()): ProductRelationGenerator {
  return {
    async generate(rawInput) {
      const input = productRelationGenerationInputSchema.parse(rawInput);
      const modelName = config.adminModel ?? '';
      const result = await generateText({
        model: createOpenAiResponsesModel(config, 'admin'),
        instructions: [
          'You propose product knowledge relationships for a hardware and building-materials catalog.',
          'Use only the supplied product data and administrator context.',
          'Never claim manufacturer verification unless it is explicitly present in the input.',
          'When evidence is weak, lower confidence and say what must be verified.',
          'The result is a proposal and must never be described as already approved.',
        ].join(' '),
        prompt: JSON.stringify(input),
        output: Output.object({ schema: generatedRelationSchema, name: 'product_relation_proposal' }),
        maxRetries: config.maxRetries,
        timeout: config.requestTimeoutMs,
      });
      const generated = await result.output;

      return {
        proposal: productRelationProposalSchema.parse({
          sourceProductId: input.sourceProduct.id,
          targetProductId: input.targetProduct.id,
          relationType: generated.relationType,
          source: 'ai',
          confidence: generated.confidence,
          reviewStatus: 'proposed',
          evidenceSummary: generated.evidenceSummary,
        }),
        reasoning: generated.reasoning,
        usage: {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
        },
        model: modelName,
      };
    },
  };
}
