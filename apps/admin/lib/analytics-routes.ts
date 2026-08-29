import type { AnalyticsView } from './analytics';

const statsPaths: Record<AnalyticsView, string> = {
  command: '/stats',
  money: '/stats/time',
  acquisition: '/stats/meta-ads',
  fulfillment: '/stats/fulfillment',
  storefront: '/stats/website',
  search: '/stats/search',
  catalog: '/stats/products',
  assumptions: '/stats/costs',
};

export function statsPath(view: AnalyticsView) {
  return statsPaths[view];
}
