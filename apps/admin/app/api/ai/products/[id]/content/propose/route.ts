import { NextRequest, NextResponse } from 'next/server';
import { productContentFieldSchema } from '@bric/ai-core';
import { z } from 'zod';

import { hasDb } from '@bric/db/client';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import {
  AiContentNotFoundError,
  AiProposalConflictError,
  proposeProductContent,
} from '../../../../../../../lib/ai-product-content';
import { auth } from '../../../../../../../lib/auth';
import { requireMutationAccess } from '../../../../../../../lib/rbac';

const requestSchema = z.object({
  fields: z.array(productContentFieldSchema).min(1).optional(),
  context: z.string().trim().max(2_000).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMutationAccess('products');
  if (denied) return denied;
  if (!hasDb())
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  const productId = parsePositiveIntegerId((await params).id);
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (productId === null || !parsed.success) {
    return NextResponse.json({ error: 'Invalid product content request.' }, { status: 400 });
  }

  try {
    const session = await auth();
    const proposal = await proposeProductContent({
      productId,
      fields: parsed.data.fields,
      adminContext: parsed.data.context,
      actorId: session?.user?.email ?? null,
    });
    return NextResponse.json({ proposal }, { status: 201 });
  } catch (error) {
    if (error instanceof AiContentNotFoundError)
      return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof AiProposalConflictError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    if (
      error instanceof Error &&
      (error.message === 'AI is disabled' || error.message.includes('is not configured'))
    ) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: 'AI content generation failed.' }, { status: 502 });
  }
}
