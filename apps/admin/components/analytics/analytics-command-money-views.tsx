'use client';
import { MoneyViewView } from './money/money-view';
import { useMoneyView } from './money/use-money';
export function MoneyView(...args: Parameters<typeof useMoneyView>) {
  const model = useMoneyView(...args);
  if (model.view === null) return model.fallback;
  return <MoneyViewView {...model.view} />;
}
export { CommandView } from './money/use-money';
