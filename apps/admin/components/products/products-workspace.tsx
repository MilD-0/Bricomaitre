'use client';
import { useProductsWorkspace } from './workspace/use-workspace';
import { ProductsWorkspaceView } from './workspace/workspace-view';
export function ProductsWorkspace(...args: Parameters<typeof useProductsWorkspace>) {
  const model = useProductsWorkspace(...args);
  if (model.view === null) return model.fallback;
  return <ProductsWorkspaceView {...model.view} />;
}
