'use client';
import { ActionHistoryPanelView } from './action-history/action-history-view';
import { useActionHistoryPanel } from './action-history/use-action-history';
export function ActionHistoryPanel(...args: Parameters<typeof useActionHistoryPanel>) {
  const model = useActionHistoryPanel(...args);
  if (model.view === null) return model.fallback;
  return <ActionHistoryPanelView {...model.view} />;
}
