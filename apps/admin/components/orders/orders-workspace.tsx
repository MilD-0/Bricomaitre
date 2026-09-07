'use client';
import { useOrdersWorkspace } from './workspace/use-workspace';
import { OrdersWorkspaceView } from './workspace/workspace-view';
export function OrdersWorkspace(...args: Parameters<typeof useOrdersWorkspace>) {
  const model = useOrdersWorkspace(...args);
  if (model.view === null) return model.fallback;
  return <OrdersWorkspaceView {...model.view} />;
}
