import { z } from 'zod';

import { navigationKeys, type NavigationKey } from './navigation';

const adminAiSurfaceValues = [...navigationKeys, 'unknown'] as const;
const adminAiEntityTypeValues = [
  'product',
  'order',
  'proposal',
  'inventoryProduct',
  'brand',
  'category',
  'asset',
  'landingPage',
  'backgroundJob',
  'bulletinPost',
  'actionLog',
  'accessGrant',
  'roleDefinition',
] as const;

const adminAiFilterValueSchema = z.union([
  z.string().trim().max(200),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const adminAiSurfaceContextSchema = z
  .object({
    locale: z.enum(['en', 'fr', 'ar']),
    surface: z.enum(adminAiSurfaceValues),
    section: z.string().trim().min(1).max(80).nullable().default(null),
    pathname: z.string().trim().min(1).max(2_048),
    hash: z.string().trim().max(120).nullable().default(null),
    filters: z.record(z.string().trim().min(1).max(80), adminAiFilterValueSchema).default({}),
    selection: z
      .object({
        entityType: z.enum(adminAiEntityTypeValues),
        ids: z.array(z.number().int().positive()).max(500).default([]),
        focusedId: z.number().int().positive().nullable().default(null),
      })
      .strict()
      .nullable()
      .default(null),
  })
  .strict();

export type AdminAiSurfaceContext = z.infer<typeof adminAiSurfaceContextSchema>;
export type AdminAiSurface = AdminAiSurfaceContext['surface'];
type AdminAiEntityType = (typeof adminAiEntityTypeValues)[number];
export type AdminAiSurfaceDetails = {
  filters?: Record<string, string | number | boolean | null>;
  selection?: {
    entityType: AdminAiEntityType;
    ids: number[];
    focusedId?: number | null;
  } | null;
};

export function mergeAdminAiSurfaceDetails(details: readonly AdminAiSurfaceDetails[]) {
  const filters: NonNullable<AdminAiSurfaceDetails['filters']> = {};
  let selection: AdminAiSurfaceDetails['selection'] | undefined;
  for (const detail of details) {
    Object.assign(filters, detail.filters ?? {});
    if (detail.selection !== undefined) selection = detail.selection;
  }
  return { filters, selection };
}

const analyticsSections: Record<string, string> = {
  '': 'command',
  time: 'money',
  'meta-ads': 'acquisition',
  fulfillment: 'fulfillment',
  website: 'storefront',
  search: 'search',
  products: 'catalog',
  costs: 'assumptions',
};

function localeFromPath(pathname: string) {
  const locale = pathname.split('/').filter(Boolean)[0];
  return locale === 'ar' || locale === 'fr' ? locale : 'en';
}

function routeWithoutLocale(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === 'en' || segments[0] === 'fr' || segments[0] === 'ar') segments.shift();
  return segments;
}

function surfaceFromSegment(segment: string): NavigationKey | 'unknown' {
  if (segment === 'administration') return 'administration';
  if (segment === 'products' || segment === 'archive') return 'products';
  if (segment === 'ai-proposals') return 'aiProposals';
  if (segment === 'orders') return 'orders';
  if (segment === 'inventory') return 'inventory';
  if (segment === 'assets' || segment === 'landing-pages') return 'assets';
  if (segment === 'brands' || segment === 'categories' || segment === 'brands-categories') {
    return 'brandsCategories';
  }
  if (segment === 'stats') return 'stats';
  if (segment === 'bulletin') return 'bulletin';
  return 'unknown';
}

function routeSection(surface: AdminAiSurface, segments: string[], hash: string) {
  if (surface === 'stats') return analyticsSections[segments[1] ?? ''] ?? 'command';
  if (surface === 'orders') return segments[1] === 'ecotrack' ? 'ecotrack' : 'orders';
  if (surface === 'assets') {
    if (segments[0] === 'landing-pages' || segments[1] === 'landing-pages') return 'landingPages';
    if (segments[1] === 'featured-groups' || hash === 'featured-groups') return 'featuredGroups';
    if (segments[1] === 'product-cards' || hash === 'product-cards') return 'productCards';
    return hash === 'banners' || !hash ? 'banners' : hash;
  }
  if (surface === 'brandsCategories') {
    return segments[0] === 'categories' ? 'categories' : 'brands';
  }
  if (surface === 'administration') return segments[1] ?? 'overview';
  if (surface === 'products') return segments[0] === 'archive' ? 'archive' : 'catalog';
  return null;
}

function safeAnalyticsFilters(searchParams: URLSearchParams) {
  const filters: Record<string, string> = {};
  for (const key of ['range', 'startDate', 'endDate', 'grain']) {
    const value = searchParams.get(key);
    if (value) filters[key] = value.slice(0, 200);
  }
  return filters;
}

export function resolveAdminAiSurfaceContext(
  pathname: string,
  searchParams = new URLSearchParams(),
  rawHash = '',
): AdminAiSurfaceContext {
  const segments = routeWithoutLocale(pathname);
  const surface = surfaceFromSegment(segments[0] ?? '');
  const hash = rawHash.replace(/^#/, '').slice(0, 120);
  const landingPageId =
    surface === 'assets' && routeSection(surface, segments, hash) === 'landingPages'
      ? Number(segments.at(-1))
      : Number.NaN;

  return adminAiSurfaceContextSchema.parse({
    locale: localeFromPath(pathname),
    surface,
    section: routeSection(surface, segments, hash),
    pathname,
    hash: hash || null,
    filters: surface === 'stats' ? safeAnalyticsFilters(searchParams) : {},
    selection:
      Number.isSafeInteger(landingPageId) && landingPageId > 0
        ? { entityType: 'landingPage', ids: [landingPageId], focusedId: landingPageId }
        : null,
  });
}
