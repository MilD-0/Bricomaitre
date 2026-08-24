import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { hasDb } from '@bric/db/client';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import { AiAdminCapabilityError } from '../../../../../lib/ai-admin-capabilities';
import {
  AiContentNotFoundError,
  AiProposalConflictError,
} from '../../../../../lib/ai-product-content';
import { AiProductRelationConflictError } from '../../../../../lib/ai-product-knowledge';
import {
  AiProposalReviewConflictError,
  aiProposalReviewConflictPayload,
} from '../../../../../lib/ai-proposal-review';
import { auth } from '../../../../../lib/auth';
import { requireAppAccess, requireMutationAccess } from '../../../../../lib/rbac';
import {
  AiProposalReviewNotFoundError,
  AiProposalExpiredDeletionConflictError,
  aiProposalReviewResource,
  deleteExpiredAiProposal,
  executeAiProposalReview,
  readAiProposalReviewTarget,
  refreshAppliedAiProposalConsumers,
} from '../../../../../lib/ai-proposal-review-workflow';

const requestSchema = z.object({ action: z.enum(['approve', 'reject']) });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  const proposalId = parsePositiveIntegerId((await params).id);
  if (!parsed.success || proposalId === null)
    return NextResponse.json({ error: 'Invalid proposal review request.' }, { status: 400 });
  const denied = await requireAppAccess();
  if (denied) return denied;
  if (!hasDb())
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });

  try {
    const session = await auth();
    const proposal = await readAiProposalReviewTarget(proposalId);
    const resource = aiProposalReviewResource(proposal);
    const mutationDenied = await requireMutationAccess(resource);
    if (mutationDenied) return mutationDenied;
    const result = await executeAiProposalReview({
      proposalId,
      action: parsed.data.action,
      target: proposal,
      actor: { email: session?.user?.email, name: session?.user?.name },
    });
    if (result.status === 'applied') {
      await refreshAppliedAiProposalConsumers();
    }
    return NextResponse.json({ proposal: result });
  } catch (error) {
    if (error instanceof AiContentNotFoundError || error instanceof AiProposalReviewNotFoundError)
      return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof AiProposalReviewConflictError)
      return NextResponse.json(aiProposalReviewConflictPayload(error, proposalId), { status: 409 });
    if (error instanceof AiProposalConflictError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof AiProductRelationConflictError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof AiAdminCapabilityError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: 'AI proposal review failed.' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const proposalId = parsePositiveIntegerId((await params).id);
  if (proposalId === null)
    return NextResponse.json({ error: 'Invalid proposal id.' }, { status: 400 });
  const denied = await requireAppAccess();
  if (denied) return denied;
  if (!hasDb())
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });

  let proposal;
  try {
    proposal = await readAiProposalReviewTarget(proposalId);
  } catch (error) {
    if (error instanceof AiProposalReviewNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
  const resource = aiProposalReviewResource(proposal);
  const mutationDenied = await requireMutationAccess(resource);
  if (mutationDenied) return mutationDenied;

  try {
    return NextResponse.json({ deleted: await deleteExpiredAiProposal(proposalId) });
  } catch (error) {
    if (!(error instanceof AiProposalExpiredDeletionConflictError)) throw error;
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
}
