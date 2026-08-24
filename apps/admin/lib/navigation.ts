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
      { key: 'banners', href: '/assets', translationKey: 'assetsManager.bannersTitle' },
      {
        key: 'productGroups',
        href: '/assets/featured-groups',
        translationKey: 'assetsManager.groupsTitle',
      },
      {
        key: 'cards',
        href: '/assets/product-cards',
        translationKey: 'assetsManager.cardsTitle',
      },
      {
        key: 'landingPages',
        href: '/assets/landing-pages',
        translationKey: 'nav.landingPages',
      },
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
      { key: 'overview', href: '/stats', translationKey: 'nav.statsOverview' },
      { key: 'money', href: '/stats/time', translationKey: 'nav.statsMoney' },
      { key: 'acquisition', href: '/stats/meta-ads', translationKey: 'nav.statsAcquisition' },
      { key: 'fulfillment', href: '/stats/fulfillment', translationKey: 'nav.statsFulfillment' },
      { key: 'storefront', href: '/stats/website', translationKey: 'nav.statsStorefront' },
      {
        key: 'aiOperations',
        href: '/stats/ai-assistants',
        translationKey: 'nav.statsAiOperations',
      },
      {
        key: 'shoppingAssistant',
        href: '/stats/shopping-assistant',
        translationKey: 'nav.statsShoppingAssistant',
      },
      { key: 'search', href: '/stats/search', translationKey: 'nav.statsSearch' },
      { key: 'catalog', href: '/stats/products', translationKey: 'nav.statsCatalog' },
      { key: 'assumptions', href: '/stats/costs', translationKey: 'nav.statsAssumptions' },
    ],
  },
  {
    key: 'bulletin',
    href: '/bulletin',
  },
];
