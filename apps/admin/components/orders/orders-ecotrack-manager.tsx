'use client';
import { OrdersEcotrackManagerView } from './ecotrack-manager/ecotrack-manager-view';
import { useOrdersEcotrackManager } from './ecotrack-manager/use-ecotrack-manager';
export function OrdersEcotrackManager(...args: Parameters<typeof useOrdersEcotrackManager>) {
  const model = useOrdersEcotrackManager(...args);
  if (model.view === null) return model.fallback;
  return <OrdersEcotrackManagerView {...model.view} />;
}
