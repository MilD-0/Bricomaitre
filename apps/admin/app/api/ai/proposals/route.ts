import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';

import { loadAiProposalInbox } from '@/lib/ai-proposal-inbox';
import { requireMutationAccess } from '@/lib/rbac';

export async function GET() {
  const { response: denied } = await requireMutationAccess('products');
  if (denied) return denied;
  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }
  return NextResponse.json({ proposals: await loadAiProposalInbox(getDb()) });
}
