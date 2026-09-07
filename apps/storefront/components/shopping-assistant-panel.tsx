'use client';
import { ShoppingAssistantPanelView } from './shopping-assistant/shopping-assistant-view';
import { useShoppingAssistantPanel } from './shopping-assistant/use-shopping-assistant';
export function ShoppingAssistantPanel(...args: Parameters<typeof useShoppingAssistantPanel>) {
  const model = useShoppingAssistantPanel(...args);
  if (model.view === null) return model.fallback;
  return <ShoppingAssistantPanelView {...model.view} />;
}
export { type ShoppingAssistantLabels } from './shopping-assistant/use-shopping-assistant';
