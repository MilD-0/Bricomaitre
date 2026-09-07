'use client';
import { AssetsWorkspaceView } from './assets-state/assets-state-view';
import { useAssetsWorkspace } from './assets-state/use-assets-state';
export function AssetsWorkspace(...args: Parameters<typeof useAssetsWorkspace>) {
  const model = useAssetsWorkspace(...args);
  if (model.view === null) return model.fallback;
  return <AssetsWorkspaceView {...model.view} />;
}
export { getAssetsWorkspaceCopy, type AssetsWorkspaceView } from './assets-state/use-assets-state';
