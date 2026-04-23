import 'dotenv/config';

import fs from 'node:fs';
import path from 'node:path';

import { eq, isNull, or } from 'drizzle-orm';

import { db } from '../db';
import { orders } from '../db/schema';
import type { MongoOrderDocument } from '../lib/mongo-product-import';
import { readMongoId } from '../lib/mongo-product-import';

type LegacyLookupStats = {
  totalLegacyOrders: number;
  duplicateTrackingKeys: number;
  duplicateReferenceKeys: number;
};

type MatchCandidate = {
  mongoId: string;
  via: 'tracking' | 'reference' | 'both';
};

function buildUniqueLookup(
  items: MongoOrderDocument[],
  selectKey: (item: MongoOrderDocument) => string | null,
) {
  const valuesByKey = new Map<string, Set<string>>();

  for (const item of items) {
    const key = selectKey(item)?.trim();
    const mongoId = readMongoId(item._id)?.trim();

    if (!key || !mongoId) {
      continue;
    }

    const current = valuesByKey.get(key) ?? new Set<string>();
    current.add(mongoId);
    valuesByKey.set(key, current);
  }

  const uniqueValues = new Map<string, string>();
  let duplicateKeys = 0;

  for (const [key, mongoIds] of valuesByKey.entries()) {
    if (mongoIds.size === 1) {
      uniqueValues.set(key, mongoIds.values().next().value as string);
      continue;
    }

    duplicateKeys += 1;
  }

  return { uniqueValues, duplicateKeys };
}

function loadLegacyOrders() {
  const exportPath = path.resolve(process.cwd(), '../legacy-mongo-exports/mongo-orders.json');
  const payload = fs.readFileSync(exportPath, 'utf8');
  const parsed = JSON.parse(payload) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error(`Expected an array in ${exportPath}.`);
  }

  const items = parsed.filter((item): item is MongoOrderDocument => typeof item === 'object' && item !== null);
  const trackingLookup = buildUniqueLookup(items, (item) =>
    typeof item.ecotrackTrackingNumber === 'string' ? item.ecotrackTrackingNumber : null,
  );
  const referenceLookup = buildUniqueLookup(items, (item) =>
    typeof item.ecotrackReference === 'string' ? item.ecotrackReference : null,
  );

  return {
    trackingLookup: trackingLookup.uniqueValues,
    referenceLookup: referenceLookup.uniqueValues,
    stats: {
      totalLegacyOrders: items.length,
      duplicateTrackingKeys: trackingLookup.duplicateKeys,
      duplicateReferenceKeys: referenceLookup.duplicateKeys,
    } satisfies LegacyLookupStats,
  };
}

function resolveCandidate(
  order: {
    ecotrackTrackingNumber: string | null;
    ecotrackReference: string | null;
  },
  lookups: {
    trackingLookup: Map<string, string>;
    referenceLookup: Map<string, string>;
  },
): MatchCandidate | null {
  const byTracking = order.ecotrackTrackingNumber ? lookups.trackingLookup.get(order.ecotrackTrackingNumber) : null;
  const byReference = order.ecotrackReference ? lookups.referenceLookup.get(order.ecotrackReference) : null;

  if (byTracking && byReference && byTracking !== byReference) {
    return null;
  }

  if (byTracking && byReference) {
    return { mongoId: byTracking, via: 'both' };
  }

  if (byTracking) {
    return { mongoId: byTracking, via: 'tracking' };
  }

  if (byReference) {
    return { mongoId: byReference, via: 'reference' };
  }

  return null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const { trackingLookup, referenceLookup, stats } = loadLegacyOrders();

  const existingOrders = await db
    .select({
      id: orders.id,
      mongoId: orders.mongoId,
      ecotrackTrackingNumber: orders.ecotrackTrackingNumber,
      ecotrackReference: orders.ecotrackReference,
    })
    .from(orders)
    .where(or(isNull(orders.mongoId), eq(orders.mongoId, '')));

  const matches = existingOrders
    .map((order) => ({
      id: order.id,
      candidate: resolveCandidate(order, { trackingLookup, referenceLookup }),
    }))
    .filter((item): item is { id: number; candidate: MatchCandidate } => item.candidate !== null);

  const viaCounts = matches.reduce(
    (acc, item) => {
      acc[item.candidate.via] += 1;
      return acc;
    },
    { tracking: 0, reference: 0, both: 0 },
  );

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    legacy: stats,
    scannedOrders: existingOrders.length,
    matchedOrders: matches.length,
    matchedVia: viaCounts,
    sample: matches.slice(0, 10).map((item) => ({
      id: item.id,
      mongoId: item.candidate.mongoId,
      via: item.candidate.via,
    })),
  }, null, 2));

  if (!apply || matches.length === 0) {
    return;
  }

  for (const item of matches) {
    await db
      .update(orders)
      .set({ mongoId: item.candidate.mongoId })
      .where(eq(orders.id, item.id));
  }

  console.log(`Applied ${matches.length} mongo_id updates.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
