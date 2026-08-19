import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getDb, hasDb } from '@bric/db/client';
import { aiProposals } from '@bric/db/schema';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import { and, eq, lte } from 'drizzle-orm';
import {
  AiAdminCapabilityError,
  reviewAdminProposal,
} from '../../../../../lib/ai-admin-capabilities';
import {
  AiContentNotFoundError,
  AiProposalConflictError,
  reviewProductContentProposal,
} from '../../../../../lib/ai-product-content';
import {
  AiProductRelationConflictError,
  reviewProductRelationProposal,
} from '../../../../../lib/ai-product-knowledge';
import { auth } from '../../../../../lib/auth';
import { startProductCatalogFeedRefreshJob } from '../../../../../lib/background-jobs';
import { requireAppAccess, requireMutationAccess } from '../../../../../lib/rbac';
import { CACHE_TAGS, revalidateServerTags } from '../../../../../lib/server-cache';
import { revalidateStorefrontProducts } from '../../../../../lib/storefront-revalidate';

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
    const [proposal] = await getDb()
      .select({ type: aiProposals.proposalType, entityType: aiProposals.entityType })
      .from(aiProposals)
      .where(eq(aiProposals.id, proposalId))
      .limit(1);
    if (!proposal) return NextResponse.json({ error: 'Proposal not found.' }, { status: 404 });
    const resource =
      proposal.type === 'featured_products' || proposal.type === 'landing_page'
        ? 'assets'
        : proposal.entityType === 'brands' || proposal.entityType === 'categories'
          ? 'brandsCategories'
          : 'products';
    const mutationDenied = await requireMutationAccess(resource);
    if (mutationDenied) return mutationDenied;
    const result =
      proposal.type === 'product_content'
        ? await reviewProductContentProposal({
            proposalId,
            action: parsed.data.action,
            actor: { email: session?.user?.email, name: session?.user?.name },
          })
        : proposal.type === 'product_relation'
          ? await reviewProductRelationProposal({
              proposalId,
              action: parsed.data.action,
              actorId: session?.user?.email,
            })
          : await reviewAdminProposal({
              proposalId,
              action: parsed.data.action,
              actorId: session?.user?.email,
              actorName: session?.user?.name,
            });
    if (result.status === 'applied') {
      revalidateServerTags(CACHE_TAGS.products, CACHE_TAGS.productsMeta);
      await revalidateStorefrontProducts();
      await startProductCatalogFeedRefreshJob('ai-product-content:apply').catch(() => undefined);
    }
    return NextResponse.json({ proposal: result });
  } catch (error) {
    if (error instanceof AiContentNotFoundError)
      return NextResponse.json({ error: error.message }, { status: 404 });
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

  const db = getDb();
  const [proposal] = await db
    .select({ type: aiProposals.proposalType, entityType: aiProposals.entityType })
    .from(aiProposals)
    .where(eq(aiProposals.id, proposalId))
    .limit(1);
  if (!proposal) return NextResponse.json({ error: 'Proposal not found.' }, { status: 404 });

  const resource =
    proposal.type === 'featured_products' || proposal.type === 'landing_page'
      ? 'assets'
      : proposal.entityType === 'brands' || proposal.entityType === 'categories'
        ? 'brandsCategories'
        : 'products';
  const mutationDenied = await requireMutationAccess(resource);
  if (mutationDenied) return mutationDenied;

  const [deleted] = await db
    .delete(aiProposals)
    .where(
      and(
        eq(aiProposals.id, proposalId),
        eq(aiProposals.status, 'proposed'),
        lte(aiProposals.expiresAt, new Date()),
      ),
    )
    .returning({ id: aiProposals.id });
  if (!deleted) {
    return NextResponse.json(
      { error: 'Only expired pending proposals can be deleted.' },
      { status: 409 },
    );
  }
  return NextResponse.json({ deleted });
}
