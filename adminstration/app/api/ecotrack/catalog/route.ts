import { NextResponse } from 'next/server';

import { getDb, hasDb } from '../../../../db/client';
import { readEcotrackCatalog } from '../../../../lib/ecotrack';
import { requireMutationAccess } from '../../../../lib/rbac';
import { applyServerCache, CACHE_TAGS } from '../../../../lib/server-cache';

export async function GET() {
  const denied = await requireMutationAccess('orders');
  if (denied) return denied;

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  applyServerCache({ stale: 300, revalidate: 3600, expire: 86400 }, CACHE_TAGS.ecotrack);
  const catalog = await readEcotrackCatalog(getDb());

  return NextResponse.json({
    wilayas: catalog.wilayas,
    communes: catalog.communes,
    serviceFees: catalog.serviceFees,
    weightFees: catalog.weightFees,
    lastSync: catalog.lastSync,
  });
}
