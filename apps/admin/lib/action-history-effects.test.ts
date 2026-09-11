import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ refreshAnalytics: vi.fn() }));

vi.mock('./analytics-facts', () => ({
  refreshAnalyticsFactsAfterMutation: mocks.refreshAnalytics,
}));
vi.mock('./background-jobs-commerce', () => ({
  startProductCatalogFeedRefreshJob: vi.fn(),
}));
vi.mock('./server-cache', () => ({
  CACHE_TAGS: {},
  revalidateServerTags: vi.fn(),
}));
vi.mock('./storefront-revalidate', () => ({
  revalidateStorefrontAssets: vi.fn(),
  revalidateStorefrontLandingPages: vi.fn(),
  revalidateStorefrontProductMeta: vi.fn(),
  revalidateStorefrontProducts: vi.fn(),
}));

import { refreshActionHistoryConsumers } from './action-history-effects';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.refreshAnalytics.mockResolvedValue(true);
});

it('invalidates financial reporting after a stats action is recovered', async () => {
  await refreshActionHistoryConsumers('stats');
  expect(mocks.refreshAnalytics).toHaveBeenCalledOnce();
});
