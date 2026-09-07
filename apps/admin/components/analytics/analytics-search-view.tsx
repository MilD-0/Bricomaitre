'use client';
import { SearchVisibilityViewView } from './search/search-view';
import { useSearchVisibilityView } from './search/use-search';
export function SearchVisibilityView(...args: Parameters<typeof useSearchVisibilityView>) {
  const model = useSearchVisibilityView(...args);
  if (model.view === null) return model.fallback;
  return <SearchVisibilityViewView {...model.view} />;
}
