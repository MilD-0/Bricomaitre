export const navigationKeys = [
  'administration',
  'products',
  'orders',
  'inventory',
  'assets',
  'brandsCategories',
  'stats',
  'bulletin',
] as const;

export type NavigationKey = (typeof navigationKeys)[number];

export type NavigationSubItem = {
  key: string;
  href: string;
  translationKey: string;
};

export type NavigationItem = {
  key: NavigationKey;
  href: string;
  subItems?: NavigationSubItem[];
};

export const navigationItems: NavigationItem[] = [
  {
    key: 'administration',
    href: '/administration',
  },
  {
    key: 'products',
    href: '/products',
  },
  {
    key: 'orders',
    href: '/orders',
  },
  {
    key: 'inventory',
    href: '/inventory',
  },
  {
    key: 'assets',
    href: '/assets',
    subItems: [
      { key: 'banners', href: '/assets#banners', translationKey: 'assetsManager.bannersTitle' },
      { key: 'productGroups', href: '/assets#product-groups', translationKey: 'assetsManager.groupsTitle' },
      { key: 'cards', href: '/assets#cards', translationKey: 'assetsManager.cardsTitle' },
    ],
  },
  {
    key: 'brandsCategories',
    href: '/brands',
    subItems: [
      { key: 'brands', href: '/brands', translationKey: 'nav.brands' },
      { key: 'categories', href: '/categories', translationKey: 'nav.categories' },
    ],
  },
  {
    key: 'stats',
    href: '/stats',
    subItems: [
      { key: 'overview', href: '/stats', translationKey: 'statsDashboard.tabs.overview' },
      { key: 'website', href: '/stats/website', translationKey: 'statsDashboard.tabs.website' },
      { key: 'products', href: '/stats/products', translationKey: 'statsDashboard.tabs.products' },
      { key: 'geography', href: '/stats/geography', translationKey: 'statsDashboard.tabs.geography' },
      { key: 'time', href: '/stats/time', translationKey: 'statsDashboard.tabs.time' },
      { key: 'metaAds', href: '/stats/meta-ads', translationKey: 'statsDashboard.tabs.metaAds' },
      { key: 'manualOrders', href: '/stats/manual-orders', translationKey: 'statsDashboard.manualOrders.sectionTitle' },
      { key: 'imports', href: '/stats/import-history', translationKey: 'statsDashboard.imports.title' },
    ],
  },
  {
    key: 'bulletin',
    href: '/bulletin',
  },
];
