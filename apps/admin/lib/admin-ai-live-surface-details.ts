import type { AdminAiSurfaceDetails } from './admin-ai-context';

function selection(
  entityType: NonNullable<AdminAiSurfaceDetails['selection']>['entityType'],
  ids: number[],
  focusedId: number | null = null,
): AdminAiSurfaceDetails['selection'] {
  const validIds = [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))];
  const validFocus = focusedId && validIds.includes(focusedId) ? focusedId : null;
  return validIds.length ? { entityType, ids: validIds, focusedId: validFocus } : null;
}

export function assetsAiSurfaceDetails(input: {
  view: 'banners' | 'groups' | 'cards';
  itemCount: number;
  pending: boolean;
  editor?: { kind: 'banner' | 'group' | 'card'; itemId?: number | null } | null;
}): AdminAiSurfaceDetails {
  const focusedId = input.editor?.itemId ?? null;
  return {
    filters: {
      view: input.view,
      itemCount: input.itemCount,
      pending: input.pending,
      editorKind: input.editor?.kind ?? null,
      editorMode: input.editor ? (focusedId ? 'edit' : 'create') : null,
    },
    selection: focusedId ? selection('asset', [focusedId], focusedId) : null,
  };
}

export function taxonomyAiSurfaceDetails(input: {
  view: 'brands' | 'categories';
  page: number;
  search: string;
  sort: string;
  visibleCount: number;
  totalItems: number;
  selectedIds: number[];
  focusedId?: number | null;
  loading: boolean;
}): AdminAiSurfaceDetails {
  const ids = [...input.selectedIds, ...(input.focusedId ? [input.focusedId] : [])];
  return {
    filters: {
      view: input.view,
      page: input.page,
      search: input.search,
      sort: input.sort,
      visibleCount: input.visibleCount,
      totalItems: input.totalItems,
      loading: input.loading,
    },
    selection: selection(input.view === 'brands' ? 'brand' : 'category', ids, input.focusedId),
  };
}

export function analyticsAiSurfaceDetails(input: {
  view: string;
  range: string;
  startDate: string | null;
  endDate: string;
  grain: string;
  referenceDate: string;
  reviewClock: boolean;
  queryDurationMs: number;
  responseSizeBytes: number;
  sources: Array<{ key: string; state: string }>;
  effectiveRanges?: Array<{ key: string; startDate: string | null; endDate: string }>;
  warnings: Array<{ key: string }>;
  fetching: boolean;
}): AdminAiSurfaceDetails {
  return {
    filters: {
      view: input.view,
      range: input.range,
      startDate: input.startDate,
      endDate: input.endDate,
      grain: input.grain,
      referenceDate: input.referenceDate,
      reviewClock: input.reviewClock,
      queryDurationMs: input.queryDurationMs,
      responseSizeBytes: input.responseSizeBytes,
      sourceStates: input.sources.map((source) => `${source.key}:${source.state}`).join(','),
      effectiveRanges: (input.effectiveRanges ?? [])
        .map((range) => `${range.key}:${range.startDate ?? 'all'}..${range.endDate}`)
        .join(','),
      warnings: input.warnings.map((warning) => warning.key).join(','),
      fetching: input.fetching,
    },
    selection: null,
  };
}

export function bulletinAiSurfaceDetails(input: {
  activeTag: string;
  sort: string;
  page: number;
  visibleCount: number;
  totalPosts: number;
  composerOpen: boolean;
  focusedPostId?: number | null;
  fetching: boolean;
}): AdminAiSurfaceDetails {
  const focusedId = input.focusedPostId ?? null;
  return {
    filters: {
      activeTag: input.activeTag,
      sort: input.sort,
      page: input.page,
      visibleCount: input.visibleCount,
      totalPosts: input.totalPosts,
      composerOpen: input.composerOpen,
      fetching: input.fetching,
    },
    selection: focusedId ? selection('bulletinPost', [focusedId], focusedId) : null,
  };
}

export function administrationAiSurfaceDetails(section: string): AdminAiSurfaceDetails {
  return { filters: { section }, selection: null };
}
