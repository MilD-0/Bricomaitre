import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { buildEcotrackPostingPreview } from '../../../../../lib/ecotrack';
import { requireMutationAccess } from '../../../../../lib/rbac';

function parseRequestBody(body: unknown): {
  mode: 'selected' | 'confirmed' | null;
  orderIds: number[];
} {
  let mode: 'selected' | 'confirmed' | null = null;
  if (body && typeof body === 'object') {
    const rawMode = (body as Record<string, unknown>).mode;
    if (rawMode === 'confirmed' || rawMode === 'selected') {
      mode = rawMode;
    }
  }
  const rawOrderIds =
    body && typeof body === 'object' && Array.isArray((body as Record<string, unknown>).orderIds)
      ? ((body as Record<string, unknown>).orderIds as unknown[])
      : [];
  const orderIds = [
    ...new Set(
      rawOrderIds
        .map((value) => Number(value))
        .filter((value): value is number => Number.isInteger(value) && value > 0),
    ),
  ];

  return { mode, orderIds };
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
  const { mode, orderIds } = parseRequestBody(body);
  if (!mode || orderIds.length === 0) {
    return NextResponse.json({ error: 'mode and orderIds are required.' }, { status: 400 });
  }

  const preview = await buildEcotrackPostingPreview(getDb(), mode, orderIds);
  return NextResponse.json(preview);
}
