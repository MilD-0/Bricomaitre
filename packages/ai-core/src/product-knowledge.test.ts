import { describe, expect, it } from 'vitest';

import { productRelationProposalSchema } from './product-knowledge';

describe('product relation AI contracts', () => {
  it('rejects AI proposals without evidence', () => {
    expect(
      productRelationProposalSchema.safeParse({
        sourceProductId: 1,
        targetProductId: 2,
        relationType: 'compatible_with',
        source: 'ai',
        confidence: 0.5,
        reviewStatus: 'proposed',
        evidenceSummary: null,
      }).success,
    ).toBe(false);
  });
});
