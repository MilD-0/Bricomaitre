import { getDb } from '@bric/db/client';
import { ecotrackOrderStates, orders } from '@bric/db/schema';

export type EcotrackDatabase = ReturnType<typeof getDb>;
export type EcotrackTransaction = Parameters<Parameters<EcotrackDatabase['transaction']>[0]>[0];
export type EcotrackShipmentRow = typeof ecotrackOrderStates.$inferSelect & {
  order: typeof orders.$inferSelect;
};
