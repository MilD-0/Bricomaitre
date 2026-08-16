import { canViewOps, hasPermission, type PermissionKey, type Role } from './permissions';
import type { NavigationKey } from './navigation';

export function canAccessNavigationItem({
  isAllowed,
  key,
  permissions,
  role,
}: {
  isAllowed: boolean;
  key: NavigationKey;
  permissions: readonly PermissionKey[];
  role: Role;
}) {
  if (!isAllowed) {
    return false;
  }

  if (key === 'administration') {
    return role === 'admin' || role === 'developer';
  }

  if (key === 'products' || key === 'inventory') {
    return hasPermission(permissions, 'products_write');
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
    return canViewOps(permissions);
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
  return canViewOps(permissions);
}
