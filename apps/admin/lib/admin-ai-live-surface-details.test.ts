import { describe, expect, it } from 'vitest';

import {
  administrationAiSurfaceDetails,
  analyticsAiSurfaceDetails,
  analyticsFocusAiSurfaceDetails,
  assetsAiSurfaceDetails,
  bulletinAiSurfaceDetails,
  taxonomyAiSurfaceDetails,
} from './admin-ai-live-surface-details';

describe('admin AI live surface adapters', () => {
  it('describes the exact asset view and focused editor record', () => {
    expect(
      assetsAiSurfaceDetails({
        view: 'groups',
        itemCount: 14,
        pending: false,
        editor: { kind: 'group', itemId: 31 },
      }),
    ).toEqual({
      filters: {
        view: 'groups',
        itemCount: 14,
        pending: false,
        editorKind: 'group',
        editorMode: 'edit',
      },
      selection: { entityType: 'asset', ids: [31], focusedId: 31 },
    });
  });

  it('keeps taxonomy filters and only valid selected database IDs', () => {
    expect(
      taxonomyAiSurfaceDetails({
        view: 'categories',
        page: 3,
        search: 'outillage',
        sort: 'products',
        visibleCount: 12,
        totalItems: 112,
        selectedIds: [7, -1, 7],
        focusedId: 9,
        loading: false,
      }),
    ).toMatchObject({
      filters: { view: 'categories', page: 3, search: 'outillage', totalItems: 112 },
      selection: { entityType: 'category', ids: [7, 9], focusedId: 9 },
    });
  });

  it('summarizes the resolved Analytics dataset and source health', () => {
    expect(
      analyticsAiSurfaceDetails({
        view: 'acquisition',
        range: '30d',
        startDate: '2026-07-24',
        endDate: '2026-08-23',
        grain: 'day',
        referenceDate: '2026-08-23',
        reviewClock: false,
        queryDurationMs: 82,
        responseSizeBytes: 12000,
        sources: [
          { key: 'orders', state: 'ready' },
          { key: 'meta', state: 'partial' },
        ],
        effectiveRanges: [{ key: 'acquisition', startDate: '2026-07-24', endDate: '2026-08-17' }],
        warnings: [{ key: 'sourcePartial' }],
        fetching: false,
      }).filters,
    ).toMatchObject({
      view: 'acquisition',
      sourceStates: 'orders:ready,meta:partial',
      effectiveRanges: 'acquisition:2026-07-24..2026-08-17',
      warnings: 'sourcePartial',
      queryDurationMs: 82,
    });
  });

  it('exposes the exact visible analytics selection as model context', () => {
    expect(
      analyticsFocusAiSurfaceDetails({
        dimension: 'campaigns',
        search: 'Summer tools',
        identifiers: ['cmp-2', 'cmp-2', 'cmp-7'],
      }),
    ).toEqual({
      filters: {
        analyticsFocus: 'campaigns',
        analyticsSearch: 'Summer tools',
        analyticsIdentifiers: 'cmp-2|cmp-7',
      },
    });
  });

  it('exposes focused Bulletin and Administration state', () => {
    expect(
      bulletinAiSurfaceDetails({
        activeTag: 'ops',
        sort: 'updated-desc',
        page: 2,
        visibleCount: 8,
        totalPosts: 28,
        composerOpen: true,
        focusedPostId: 44,
        fetching: false,
      }),
    ).toMatchObject({
      filters: { activeTag: 'ops', page: 2, composerOpen: true },
      selection: { entityType: 'bulletinPost', ids: [44], focusedId: 44 },
    });
    expect(administrationAiSurfaceDetails('roles')).toEqual({
      filters: { section: 'roles' },
      selection: null,
    });
  });
});
