'use client';
import { useOrdersWorkflows } from './workflows/use-workflows';
import { OrdersWorkflowsView } from './workflows/workflows-view';
export function OrdersWorkflows(...args: Parameters<typeof useOrdersWorkflows>) {
  const model = useOrdersWorkflows(...args);
  if (model.view === null) return model.fallback;
  return <OrdersWorkflowsView {...model.view} />;
}
