import { NextResponse } from 'next/server';

import { auth } from './auth';
import { canViewOps, hasPermission, normalizePermissions, type PermissionKey } from './permissions';

export type MutationResource = 'products' | 'orders' | 'assets' | 'brandsCategories' | 'bulletin' | 'stats' | 'settings' | 'ecotrack';

const resourcePermissions: Record<MutationResource, PermissionKey> = {
  products: 'products_write',
  orders: 'orders_write',
  assets: 'assets_write',
  brandsCategories: 'brands_categories_write',
  bulletin: 'bulletin_moderate',
  stats: 'ops_view',
  settings: 'settings_manage',
  ecotrack: 'orders_write',
};

export function canMutateResource(access: readonly PermissionKey[] | undefined, resource: MutationResource) {
  return hasPermission(access ?? [], resourcePermissions[resource]);
}

export async function requireOpsAccess() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!session.user.isAllowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const permissions = normalizePermissions(session.user.permissions);

  if (!canViewOps(permissions)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return null;
}

export async function requireDeveloperAccess() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!session.user.isAllowed || session.user.role !== 'developer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return null;
}

export async function requireAdministrationAccess() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!session.user.isAllowed || (session.user.role !== 'admin' && session.user.role !== 'developer')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return null;
}

export async function requireMutationAccess(resource: MutationResource) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!session.user.isAllowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const permissions = normalizePermissions(session.user.permissions);

  if (canMutateResource(permissions, resource)) {
    return null;
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
