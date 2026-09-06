import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { hasDb } from '@bric/db/client';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import {
  AiProductNotFoundError,
  proposeProductRelation,
  UnsupportedProductRelationError,
} from '../../../../../../../lib/ai-product-knowledge';
import { requireMutationAccess } from '../../../../../../../lib/rbac';

const requestSchema = z.object({
  targetProductId: z.number().int().positive(),
  context: z.string().trim().max(2_000).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response: denied, session } = await requireMutationAccess('products');
  if (denied) return denied;

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const sourceProductId = parsePositiveIntegerId(id);
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (
    sourceProductId === null ||
    !parsed.success ||
    parsed.data.targetProductId === sourceProductId
  ) {
    return NextResponse.json({ error: 'Invalid product relation request.' }, { status: 400 });
  }

  try {
    const proposal = await proposeProductRelation({
      sourceProductId,
      targetProductId: parsed.data.targetProductId,
      adminContext: parsed.data.context,
      actorId: session?.user?.email ?? null,
    });
    return NextResponse.json({ proposal }, { status: 201 });
  } catch (error) {
    if (error instanceof AiProductNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof UnsupportedProductRelationError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (
      error instanceof Error &&
      (error.message === 'AI is disabled' || error.message.includes('is not configured'))
    ) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: 'AI proposal generation failed.' }, { status: 502 });
  }
}
