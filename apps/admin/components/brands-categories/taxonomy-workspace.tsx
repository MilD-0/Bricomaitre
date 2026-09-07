'use client';
import { TaxonomyWorkspaceView } from './taxonomy/taxonomy-view';
import { useTaxonomyWorkspace } from './taxonomy/use-taxonomy';
export function TaxonomyWorkspace(...args: Parameters<typeof useTaxonomyWorkspace>) {
  const model = useTaxonomyWorkspace(...args);
  if (model.view === null) return model.fallback;
  return <TaxonomyWorkspaceView {...model.view} />;
}
