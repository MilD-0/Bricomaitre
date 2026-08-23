import { describe, expect, it } from 'vitest';

import {
  AiProposalReviewConflictError,
  aiProposalReviewConflictPayload,
} from './ai-proposal-review';

describe('AI proposal review conflicts', () => {
  it.each([
    ['proposal_already_reviewed', 'refresh'],
    ['proposal_stale', 'regenerate'],
    ['proposal_expired', 'regenerate'],
    ['proposal_dependency_changed', 'regenerate'],
    ['proposal_evidence_insufficient', 'review'],
    ['proposal_verification_failed', 'retry'],
  ] as const)('maps %s to an explicit %s recovery action', (code, nextAction) => {
    const error = new AiProposalReviewConflictError('Decision conflict.', code);
    expect(aiProposalReviewConflictPayload(error, 19)).toEqual({
      error: 'Decision conflict.',
      code,
      proposalId: 19,
      nextAction,
    });
  });
});
