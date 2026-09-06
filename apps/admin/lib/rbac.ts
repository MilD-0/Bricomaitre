import { NextResponse } from 'next/server';

import { auth } from './auth';
import { hasPermission, normalizePermissions, type PermissionKey } from './permissions';

export type MutationResource =
  | 'products'
  | 'orders'
  | 'assets'
  | 'brandsCategories'
  | 'bulletin'
  | 'stats'
  | 'settings'
  | 'ecotrack';

const resourcePermissions: Record<MutationResource, PermissionKey> = {
  products: 'products_write',
  orders: 'orders_write',
  assets: 'assets_write',
  brandsCategories: 'brands_categories_write',
  bulletin: 'bulletin_moderate',
  stats: 'analytics_manage',
  settings: 'settings_manage',
  ecotrack: 'orders_write',
};

export function canMutateResource(
  access: readonly PermissionKey[] | undefined,
  resource: MutationResource,
) {
  return hasPermission(access ?? [], resourcePermissions[resource]);
}

async function requirePermissionAccess(permission: PermissionKey) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!session.user.isAllowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const permissions = normalizePermissions(session.user.permissions);

  if (!hasPermission(permissions, permission)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return null;
}

export async function requireAnalyticsAccess() {
  return requirePermissionAccess('analytics_manage');
}

export async function requireSettingsAccess() {
  return requirePermissionAccess('settings_manage');
}

export async function requireOpsAccess() {
  return requirePermissionAccess('ops_view');
}

export async function requireMutationAccess(resource: MutationResource) {
  return requirePermissionAccess(resourcePermissions[resource]);
}

export async function requireAppAccess() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!session.user.isAllowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return null;
}
