import { canManageAnalytics, canManageSettings, hasPermission, type PermissionKey, type Role } from './permissions';
import type { NavigationKey } from './navigation';

export function canAccessNavigationItem(access: {
  isAllowed: boolean;
  key: NavigationKey;
  permissions: readonly PermissionKey[];
  role: Role;
}) {
  const { isAllowed, key, permissions } = access;
  if (!isAllowed) {
    return false;
  }

  if (key === 'administration') {
    return canManageSettings(permissions);
  }

  if (key === 'products' || key === 'inventory') {
    return hasPermission(permissions, 'products_write');
  }

  if (key === 'aiProposals') {
    return (
      hasPermission(permissions, 'products_write') ||
      hasPermission(permissions, 'assets_write') ||
      hasPermission(permissions, 'brands_categories_write')
    );
  }

  if (key === 'orders') {
    return hasPermission(permissions, 'orders_write');
  }

  if (key === 'assets') {
    return hasPermission(permissions, 'assets_write');
  }

  if (key === 'brandsCategories') {
    return hasPermission(permissions, 'brands_categories_write');
  }

  if (key === 'stats') {
    return canManageAnalytics(permissions);
  }

  if (key === 'bulletin') {
    return true;
  }

  return false;
}

export function getDefaultAuthorizedHref({
  isAllowed,
  locale,
  permissions,
  role,
}: {
  isAllowed: boolean;
  locale: string;
  permissions: readonly PermissionKey[];
  role: Role;
}) {
  if (!isAllowed) {
    return `/${locale}`;
  }

  const orderedKeys: NavigationKey[] = [
    'administration',
    'products',
    'aiProposals',
    'orders',
    'inventory',
    'assets',
    'brandsCategories',
    'stats',
    'bulletin',
  ];
  const hrefByKey: Record<NavigationKey, string> = {
    administration: '/administration',
    products: '/products',
    aiProposals: '/ai-proposals',
    orders: '/orders',
    inventory: '/inventory',
    assets: '/assets',
    brandsCategories: '/brands',
    stats: '/stats',
    bulletin: '/bulletin',
  };

  const firstAccessibleKey = orderedKeys.find((key) =>
    canAccessNavigationItem({ isAllowed, key, permissions, role }),
  );
  return `/${locale}${hrefByKey[firstAccessibleKey ?? 'bulletin']}`;
}

export function canAccessBulletin(isAllowed: boolean) {
  return isAllowed;
}

export function canAccessProducts(permissions: readonly PermissionKey[]) {
  return hasPermission(permissions, 'products_write');
}

export function canAccessOrders(permissions: readonly PermissionKey[]) {
  return hasPermission(permissions, 'orders_write');
}

export function canAccessAssets(permissions: readonly PermissionKey[]) {
  return hasPermission(permissions, 'assets_write');
}

export function canAccessBrandsCategories(permissions: readonly PermissionKey[]) {
  return hasPermission(permissions, 'brands_categories_write');
}

export function canAccessStats(permissions: readonly PermissionKey[]) {
  return canManageAnalytics(permissions);
}
