import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '../../../../../db/client';
import { buildEcotrackPostingPreview } from '../../../../../lib/ecotrack';
import { requireMutationAccess } from '../../../../../lib/rbac';

function parseRequestBody(body: unknown): { mode: 'selected' | 'confirmed' | null; provider: 'delivro' | 'emir'; orderIds: number[] } {
  let mode: 'selected' | 'confirmed' | null = null;
  let provider: 'delivro' | 'emir' = 'delivro';
  if (body && typeof body === 'object') {
    const rawMode = (body as Record<string, unknown>).mode;
    if (rawMode === 'confirmed' || rawMode === 'selected') {
      mode = rawMode;
    }
    const rawProvider = (body as Record<string, unknown>).provider;
    if (rawProvider === 'delivro' || rawProvider === 'emir') provider = rawProvider;
  }
  const rawOrderIds = body && typeof body === 'object' && Array.isArray((body as Record<string, unknown>).orderIds)
    ? (body as Record<string, unknown>).orderIds as unknown[]
    : [];
  const orderIds = [...new Set(
    rawOrderIds
      .map((value) => Number(value))
      .filter((value): value is number => Number.isInteger(value) && value > 0),
  )];

  return { mode, provider, orderIds };
}

export async function POST(request: NextRequest) {
  const denied = await requireMutationAccess('orders');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const { mode, provider, orderIds } = parseRequestBody(body);
  if (!mode || orderIds.length === 0) {
    return NextResponse.json({ error: 'mode and orderIds are required.' }, { status: 400 });
  }

  const preview = provider === 'emir'
    ? await buildEcotrackPostingPreview(getDb(), mode, orderIds, provider)
    : await buildEcotrackPostingPreview(getDb(), mode, orderIds);
  return NextResponse.json(preview);
}
