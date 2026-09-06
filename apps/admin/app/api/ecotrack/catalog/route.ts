import { unstable_cache } from 'next/cache';
import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readEcotrackCatalog } from '../../../../lib/ecotrack';
import { requireMutationAccess } from '../../../../lib/rbac';
import { CACHE_TAGS } from '../../../../lib/server-cache';

const getCachedCatalog = unstable_cache(
  async () => readEcotrackCatalog(getDb()),
  ['admin-ecotrack-catalog'],
  { revalidate: 3600, tags: [CACHE_TAGS.ecotrack] },
);

export async function GET() {
  const { response: denied } = await requireMutationAccess('orders');
  if (denied) return denied;

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const catalog = await getCachedCatalog();

  return NextResponse.json({
    wilayas: catalog.wilayas,
    communes: catalog.communes,
    serviceFees: catalog.serviceFees,
    weightFees: catalog.weightFees,
    lastSync: catalog.lastSync,
  });
}
