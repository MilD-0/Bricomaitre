import type { Analytics2View } from './analytics2';

export const statsPaths: Record<Analytics2View, string> = {
  command: '/stats',
  money: '/stats/time',
  acquisition: '/stats/meta-ads',
  fulfillment: '/stats/fulfillment',
  storefront: '/stats/website',
  search: '/stats/search',
  catalog: '/stats/products',
  assumptions: '/stats/costs',
};

export function statsPath(view: Analytics2View) {
  return statsPaths[view];
}

export function statsRouteQuery(source: Record<string, string | string[] | undefined>) {
  const target = new URLSearchParams();
  const range = source.range;
  if (typeof range === 'string') target.set('range', range);
  if (range === 'custom') {
    for (const key of ['startDate', 'endDate'] as const) {
      const value = source[key];
      if (typeof value === 'string') target.set(key, value);
    }
  }
  const grain = source.grain;
  if (typeof grain === 'string') target.set('grain', grain);
  return target;
}

export function localizedStatsUrl(
  locale: string,
  view: Analytics2View,
  source: Record<string, string | string[] | undefined>,
) {
  const query = statsRouteQuery(source);
  return `/${locale}${statsPath(view)}${query.size ? `?${query.toString()}` : ''}`;
}
