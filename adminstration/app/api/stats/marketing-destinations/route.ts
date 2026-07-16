import { NextResponse } from 'next/server';

import { hasDb } from '../../../../db/client';
import { getMarketingDestinationDiagnostics } from '../../../../lib/marketing-diagnostics';
import { requireOpsAccess } from '../../../../lib/rbac';

export async function GET() {
  const denied = await requireOpsAccess();
  if (denied) return denied;
  if (!hasDb()) return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  return NextResponse.json({ data: await getMarketingDestinationDiagnostics() });
}
