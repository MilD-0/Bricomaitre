'use client';
import { AssumptionsViewView } from './assumptions/assumptions-view';
import { useAssumptionsView } from './assumptions/use-assumptions';
export function AssumptionsView(...args: Parameters<typeof useAssumptionsView>) {
  const model = useAssumptionsView(...args);
  if (model.view === null) return model.fallback;
  return <AssumptionsViewView {...model.view} />;
}
