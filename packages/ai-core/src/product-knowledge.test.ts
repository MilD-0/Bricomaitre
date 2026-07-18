import { describe, expect, it } from 'vitest';

import { createFixedProductRelationGenerator } from './testing';
import { productRelationProposalSchema } from './product-knowledge';

describe('product relation AI contracts', () => {
  it('keeps fixed test generators deterministic and provider-free', async () => {
    const result = {
      proposal: {
        sourceProductId: 1,
        targetProductId: 2,
        relationType: 'requires' as const,
        source: 'ai' as const,
        confidence: 0.7,
        reviewStatus: 'proposed' as const,
        evidenceSummary: 'The supplied specifications identify the target as required.',
      },
      reasoning: 'Requires administrator verification.',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      model: 'test-model',
    };

    await expect(createFixedProductRelationGenerator(result).generate({} as never)).resolves.toEqual(result);
  });

  it('rejects AI proposals without evidence', () => {
    expect(productRelationProposalSchema.safeParse({
      sourceProductId: 1,
      targetProductId: 2,
      relationType: 'compatible_with',
      source: 'ai',
      confidence: 0.5,
      reviewStatus: 'proposed',
      evidenceSummary: null,
    }).success).toBe(false);
  });
});
