import type { PermissionKey } from './permissions';

export const navigationKeys = [
  'administration',
  'products',
  'aiProposals',
  'orders',
  'inventory',
  'assets',
  'brandsCategories',
  'stats',
  'bulletin',
] as const;

export type NavigationKey = (typeof navigationKeys)[number];

type NavigationSubItem = {
  key: string;
  href: string;
  translationKey: string;
  requiredPermissions?: PermissionKey[];
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
    key: 'aiProposals',
    href: '/ai-proposals',
  },
  {
    key: 'orders',
    href: '/orders',
    subItems: [
      { key: 'ordersTable', href: '/orders', translationKey: 'nav.ordersTable' },
      {
        key: 'ecotrackShipments',
        href: '/orders/ecotrack',
        translationKey: 'nav.ecotrackShipments',
      },
    ],
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
      {
        key: 'productGroups',
        href: '/assets#featured-groups',
        translationKey: 'assetsManager.groupsTitle',
      },
      { key: 'cards', href: '/assets#product-cards', translationKey: 'assetsManager.cardsTitle' },
      { key: 'landingPages', href: '/landing-pages', translationKey: 'nav.landingPages' },
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
      {
        key: 'landingPages',
        href: '/stats/landing-pages',
        translationKey: 'statsDashboard.tabs.landingPages',
      },
      {
        key: 'aiAssistants',
        href: '/stats/ai-assistants',
        translationKey: 'statsDashboard.tabs.aiAssistants',
      },
      {
        key: 'customers',
        href: '/stats/customers',
        translationKey: 'statsDashboard.tabs.customers',
      },
      { key: 'products', href: '/stats/products', translationKey: 'statsDashboard.tabs.products' },
      {
        key: 'geography',
        href: '/stats/geography',
        translationKey: 'statsDashboard.tabs.geography',
      },
      { key: 'time', href: '/stats/time', translationKey: 'statsDashboard.tabs.time' },
      {
        key: 'profitTracker',
        href: '/stats/costs',
        translationKey: 'statsDashboard.tabs.costs',
      },
      { key: 'metaAds', href: '/stats/meta-ads', translationKey: 'statsDashboard.tabs.metaAds' },
      {
        key: 'manualOrders',
        href: '/stats/manual-orders',
        translationKey: 'statsDashboard.manualOrders.sectionTitle',
      },
      {
        key: 'imports',
        href: '/stats/import-history',
        translationKey: 'statsDashboard.imports.title',
      },
    ],
  },
  {
    key: 'bulletin',
    href: '/bulletin',
  },
];

const modernAssetSubItems: NavigationSubItem[] = [
  { key: 'banners', href: '/assets', translationKey: 'assetsManager.bannersTitle' },
  {
    key: 'productGroups',
    href: '/assets/featured-groups',
    translationKey: 'assetsManager.groupsTitle',
  },
  { key: 'cards', href: '/assets/product-cards', translationKey: 'assetsManager.cardsTitle' },
  {
    key: 'landingPages',
    href: '/assets/landing-pages',
    translationKey: 'nav.landingPages',
  },
];

export function navigationItemsForUi(legacyUi: boolean): NavigationItem[] {
  if (legacyUi) return navigationItems;
  return navigationItems.map((item) =>
    item.key === 'assets' ? { ...item, subItems: modernAssetSubItems } : item,
  );
}
