'use client';
import { ProductEditorPanelView } from './editor/editor-view';
import { useProductEditorPanel } from './editor/use-editor';
export function ProductEditorPanel(...args: Parameters<typeof useProductEditorPanel>) {
  const model = useProductEditorPanel(...args);
  if (model.view === null) return model.fallback;
  return <ProductEditorPanelView {...model.view} />;
}
export { type ProductEditorState, type ProductsCatalogOptions } from './editor/use-editor';
