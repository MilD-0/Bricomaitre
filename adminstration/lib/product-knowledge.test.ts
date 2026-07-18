import { describe, expect, it } from 'vitest';

import { productRelationProposalSchema } from './product-knowledge';

const validProposal = {
  sourceProductId: 10,
  targetProductId: 20,
  relationType: 'compatible_with' as const,
  source: 'ai' as const,
  confidence: 0.82,
  reviewStatus: 'proposed' as const,
  evidenceSummary: 'Both manufacturer specification sheets list the same fitting standard.',
};

describe('productRelationProposalSchema', () => {
  it('accepts an evidenced AI proposal awaiting review', () => {
    expect(productRelationProposalSchema.parse(validProposal)).toEqual(validProposal);
  });

  it('rejects self-referential product relationships', () => {
    const result = productRelationProposalSchema.safeParse({
      ...validProposal,
      targetProductId: validProposal.sourceProductId,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['targetProductId']);
  });

  it('rejects confidence values outside the zero-to-one range', () => {
    const result = productRelationProposalSchema.safeParse({ ...validProposal, confidence: 1.1 });

    expect(result.success).toBe(false);
  });

  it('prevents generated proposals from declaring themselves verified', () => {
    const result = productRelationProposalSchema.safeParse({ ...validProposal, reviewStatus: 'verified' });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path[0] === 'reviewStatus')).toBe(true);
  });

  it('requires evidence for AI-created relationships', () => {
    const result = productRelationProposalSchema.safeParse({
      ...validProposal,
      evidenceSummary: null,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path[0] === 'evidenceSummary')).toBe(true);
  });
});
