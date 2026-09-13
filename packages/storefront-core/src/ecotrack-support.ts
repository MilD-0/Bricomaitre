import { getWeightSurcharge } from './delivery-weight';
import { and, asc, desc, eq } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import {
  ecotrackCommunes,
  ecotrackServiceFees,
  ecotrackSyncRuns,
  ecotrackWeightFees,
  ecotrackWilayas,
} from '@bric/db/schema';
import { parseNumericAmount, type DeliveryType } from './orders-support';

type Database = ReturnType<typeof getDb>;
export type EcotrackCatalogExecutor = Pick<Database, 'select'>;

export type EcotrackServiceType = 'livraison' | 'pickup' | 'echange' | 'recouvrement' | 'retours';

export type EcotrackCatalogRecord = {
  wilayas: (typeof ecotrackWilayas.$inferSelect)[];
  communes: (typeof ecotrackCommunes.$inferSelect)[];
  serviceFees: (typeof ecotrackServiceFees.$inferSelect)[];
  weightFees: (typeof ecotrackWeightFees.$inferSelect)[];
  lastSync: typeof ecotrackSyncRuns.$inferSelect | null;
};

export async function readEcotrackCatalog(
  db: EcotrackCatalogExecutor,
): Promise<EcotrackCatalogRecord> {
  const [wilayas, communes, serviceFees, weightFees, lastSync] = await Promise.all([
    db.select().from(ecotrackWilayas).orderBy(asc(ecotrackWilayas.wilayaId)),
    db
      .select()
      .from(ecotrackCommunes)
      .orderBy(asc(ecotrackCommunes.wilayaId), asc(ecotrackCommunes.name)),
    db
      .select()
      .from(ecotrackServiceFees)
      .orderBy(asc(ecotrackServiceFees.serviceType), asc(ecotrackServiceFees.wilayaId)),
    db.select().from(ecotrackWeightFees).orderBy(asc(ecotrackWeightFees.serviceType)),
    db
      .select()
      .from(ecotrackSyncRuns)
      .orderBy(desc(ecotrackSyncRuns.startedAt))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  return {
    wilayas,
    communes,
    serviceFees,
    weightFees,
    lastSync,
  };
}

export async function readEcotrackDeliveryFee(
  ...args: Parameters<typeof readEcotrackDeliveryQuote>
) {
  return (await readEcotrackDeliveryQuote(...args)) ?? 0;
}

export async function readEcotrackDeliveryQuote(
  db: Database,
  wilayaId: number | null | undefined,
  deliveryType: DeliveryType,
  serviceType: EcotrackServiceType = 'livraison',
  weightKg = 0,
) {
  if (!wilayaId) {
    return null;
  }

  const [serviceFee] = await db
    .select({
      homeFee: ecotrackServiceFees.homeFee,
      stopDeskFee: ecotrackServiceFees.stopDeskFee,
    })
    .from(ecotrackServiceFees)
    .where(
      and(
        eq(ecotrackServiceFees.serviceType, serviceType),
        eq(ecotrackServiceFees.wilayaId, wilayaId),
      ),
    )
    .limit(1);

  if (!serviceFee) {
    return null;
  }

  const base =
    deliveryType === 0
      ? parseNumericAmount(serviceFee.homeFee)
      : parseNumericAmount(serviceFee.stopDeskFee);
  return base + getWeightSurcharge(weightKg);
}
