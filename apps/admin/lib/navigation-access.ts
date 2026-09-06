import { hasPermission, type PermissionKey } from './permissions';
import { navigationItems, type NavigationKey } from './navigation';

const requiredPermissions: Record<NavigationKey, PermissionKey | null> = {
  administration: 'settings_manage',
  products: 'products_write',
  aiProposals: 'products_write',
  orders: 'orders_write',
  inventory: 'products_write',
  assets: 'assets_write',
  brandsCategories: 'brands_categories_write',
  stats: 'analytics_manage',
  bulletin: null,
};

export function canAccessNavigationItem({
  isAllowed,
  key,
  permissions,
}: {
  isAllowed: boolean;
  key: NavigationKey;
  permissions: readonly PermissionKey[];
}) {
  const requiredPermission = requiredPermissions[key];
  return (
    isAllowed && (requiredPermission === null || hasPermission(permissions, requiredPermission))
  );
}

export function getDefaultAuthorizedHref({
  isAllowed,
  locale,
  permissions,
}: {
  isAllowed: boolean;
  locale: string;
  permissions: readonly PermissionKey[];
}) {
  if (!isAllowed) {
    return `/${locale}`;
  }

  const firstAccessibleItem = navigationItems.find(({ key }) =>
    canAccessNavigationItem({ isAllowed, key, permissions }),
  );
  return `/${locale}${firstAccessibleItem?.href ?? '/bulletin'}`;
}
