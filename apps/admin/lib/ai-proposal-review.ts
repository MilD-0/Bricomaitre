export const aiProposalReviewConflictCodes = [
  'proposal_already_reviewed',
  'proposal_stale',
  'proposal_expired',
  'proposal_dependency_changed',
  'proposal_evidence_insufficient',
  'proposal_verification_failed',
  'proposal_conflict',
] as const;

export type AiProposalReviewConflictCode = (typeof aiProposalReviewConflictCodes)[number];
export type AiProposalReviewNextAction = 'refresh' | 'regenerate' | 'review' | 'retry';

const nextActionByCode: Record<AiProposalReviewConflictCode, AiProposalReviewNextAction> = {
  proposal_already_reviewed: 'refresh',
  proposal_stale: 'regenerate',
  proposal_expired: 'regenerate',
  proposal_dependency_changed: 'regenerate',
  proposal_evidence_insufficient: 'review',
  proposal_verification_failed: 'retry',
  proposal_conflict: 'refresh',
};

export class AiProposalReviewConflictError extends Error {
  readonly code: AiProposalReviewConflictCode;
  readonly nextAction: AiProposalReviewNextAction;

  constructor(message: string, code: AiProposalReviewConflictCode = 'proposal_conflict') {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.nextAction = nextActionByCode[code];
  }
}

export function aiProposalReviewConflictPayload(
  error: AiProposalReviewConflictError,
  proposalId: number,
) {
  return {
    error: error.message,
    code: error.code,
    proposalId,
    nextAction: error.nextAction,
  };
}
