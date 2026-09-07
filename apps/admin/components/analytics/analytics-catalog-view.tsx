'use client';
import { CatalogViewView } from './catalog/catalog-view';
import { useCatalogView } from './catalog/use-catalog';
export function CatalogView(...args: Parameters<typeof useCatalogView>) {
  const model = useCatalogView(...args);
  if (model.view === null) return model.fallback;
  return <CatalogViewView {...model.view} />;
}
