'use client';
import { AcquisitionViewView } from './acquisition/acquisition-view';
import { useAcquisitionView } from './acquisition/use-acquisition';
export function AcquisitionView(...args: Parameters<typeof useAcquisitionView>) {
  const model = useAcquisitionView(...args);
  if (model.view === null) return model.fallback;
  return <AcquisitionViewView {...model.view} />;
}
