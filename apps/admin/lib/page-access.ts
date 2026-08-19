import { redirect } from 'next/navigation';

import { auth } from './auth';
import {
  canAccessAssets,
  canAccessBrandsCategories,
  canAccessBulletin,
  canAccessOrders,
  canAccessProducts,
  canAccessStats,
  getDefaultAuthorizedHref,
} from './navigation-access';
import { canManageSettings, hasPermission } from './permissions';

async function requireAllowedAppUser(locale: string) {
  const session = await auth();

  if (!session?.user?.isAllowed) {
    redirect(`/${locale}`);
  }

  return session;
}

export async function requireProductsPageAccess(locale: string) {
  const session = await requireAllowedAppUser(locale);

  if (!canAccessProducts(session.user.permissions)) {
    redirect(
      getDefaultAuthorizedHref({
        isAllowed: session.user.isAllowed,
        locale,
        permissions: session.user.permissions,
        role: session.user.role,
      }),
    );
  }

  return session;
}

export async function requireAiProposalPageAccess(locale: string) {
  const session = await requireAllowedAppUser(locale);
  const permissions = session.user.permissions;

  if (
    !hasPermission(permissions, 'products_write') &&
    !hasPermission(permissions, 'assets_write') &&
    !hasPermission(permissions, 'brands_categories_write')
  ) {
    redirect(
      getDefaultAuthorizedHref({
        isAllowed: session.user.isAllowed,
        locale,
        permissions,
        role: session.user.role,
      }),
    );
  }

  return session;
}

export async function requireOrdersPageAccess(locale: string) {
  const session = await requireAllowedAppUser(locale);

  if (!canAccessOrders(session.user.permissions)) {
    redirect(
      getDefaultAuthorizedHref({
        isAllowed: session.user.isAllowed,
        locale,
        permissions: session.user.permissions,
        role: session.user.role,
      }),
    );
  }

  return session;
}

export async function requireAssetsPageAccess(locale: string) {
  const session = await requireAllowedAppUser(locale);

  if (!canAccessAssets(session.user.permissions)) {
    redirect(
      getDefaultAuthorizedHref({
        isAllowed: session.user.isAllowed,
        locale,
        permissions: session.user.permissions,
        role: session.user.role,
      }),
    );
  }

  return session;
}

export async function requireBrandsCategoriesPageAccess(locale: string) {
  const session = await requireAllowedAppUser(locale);

  if (!canAccessBrandsCategories(session.user.permissions)) {
    redirect(
      getDefaultAuthorizedHref({
        isAllowed: session.user.isAllowed,
        locale,
        permissions: session.user.permissions,
        role: session.user.role,
      }),
    );
  }

  return session;
}

export async function requireStatsPageAccess(locale: string) {
  const session = await requireAllowedAppUser(locale);

  if (!canAccessStats(session.user.permissions)) {
    redirect(
      getDefaultAuthorizedHref({
        isAllowed: session.user.isAllowed,
        locale,
        permissions: session.user.permissions,
        role: session.user.role,
      }),
    );
  }

  return session;
}

export async function requireBulletinPageAccess(locale: string) {
  const session = await requireAllowedAppUser(locale);

  if (!canAccessBulletin(session.user.isAllowed)) {
    redirect(`/${locale}`);
  }

  return session;
}

export async function requireAdministrationPageAccess(locale: string) {
  const session = await requireAllowedAppUser(locale);

  if (!canManageSettings(session.user.permissions)) {
    redirect(
      getDefaultAuthorizedHref({
        isAllowed: session.user.isAllowed,
        locale,
        permissions: session.user.permissions,
        role: session.user.role,
      }),
    );
  }

  return session;
}
