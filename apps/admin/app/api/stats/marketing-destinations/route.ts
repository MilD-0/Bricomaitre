import { NextResponse } from 'next/server';

import { hasDb } from '@bric/db/client';
import { getMarketingDestinationDiagnostics } from '@/lib/marketing-diagnostics';
import { requireAnalyticsAccess } from '@/lib/rbac';

export async function GET() {
  const { response: denied } = await requireAnalyticsAccess();
  if (denied) return denied;
  if (!hasDb())
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  return NextResponse.json({ data: await getMarketingDestinationDiagnostics() });
}
