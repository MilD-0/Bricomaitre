'use client';
import { InventoryManagerView } from './inventory/inventory-view';
import { useInventoryManager } from './inventory/use-inventory';
export function InventoryManager(...args: Parameters<typeof useInventoryManager>) {
  const model = useInventoryManager(...args);
  if (model.view === null) return model.fallback;
  return <InventoryManagerView {...model.view} />;
}
