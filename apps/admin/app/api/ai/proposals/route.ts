import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';

import { loadAiProposalInbox } from '../../../../lib/ai-proposal-inbox';
import { requireAnyMutationAccess } from '../../../../lib/rbac';

export async function GET() {
  const denied = await requireAnyMutationAccess(['products', 'assets', 'brandsCategories']);
  if (denied) return denied;
  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }
  return NextResponse.json({ proposals: await loadAiProposalInbox(getDb()) });
}
