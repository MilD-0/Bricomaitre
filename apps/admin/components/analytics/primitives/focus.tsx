'use client';
import { createContext, useState } from 'react';
import type { AdminAiAnalyticsFocusDimension } from '../../../lib/admin-ai-analytics-focus';
import type { AnalyticsPayload, AnalyticsView } from '../../../lib/analytics';

export type DataOf<Kind extends AnalyticsPayload['data']['kind']> = Extract<
  AnalyticsPayload['data'],
  { kind: Kind }
>;

export const chartColors = [
  'var(--chart-violet)',
  'var(--chart-teal)',
  'var(--chart-rose)',
  'var(--chart-amber)',
  'var(--chart-blue)',
  'var(--chart-slate)',
];

export type AnalyticsAssistantFocus = {
  dimension: AdminAiAnalyticsFocusDimension;
  search?: string | null;
  identifiers?: string[];
};

export const AnalyticsAssistantFocusContext = createContext<{
  active: AnalyticsAssistantFocus | null;
  setActive: (focus: AnalyticsAssistantFocus) => void;
} | null>(null);

const defaultAnalyticsAssistantFocus: Partial<
  Record<AnalyticsView, AdminAiAnalyticsFocusDimension>
> = {
  command: 'economics_timeline',
  money: 'economics_timeline',
  fulfillment: 'cash_pipeline',
  storefront: 'storefront_trend',
};

export function AnalyticsAssistantFocusProvider({
  view,
  children,
}: {
  view: AnalyticsView;
  children: React.ReactNode;
}) {
  const defaultDimension = defaultAnalyticsAssistantFocus[view];
  const [active, setActive] = useState<AnalyticsAssistantFocus | null>(() =>
    defaultDimension ? { dimension: defaultDimension } : null,
  );
  return (
    <AnalyticsAssistantFocusContext.Provider value={{ active, setActive }}>
      {children}
    </AnalyticsAssistantFocusContext.Provider>
  );
}
