import { redirect } from 'next/navigation';

import { auth } from './auth';
import type { NavigationKey } from './navigation';
import { canAccessNavigationItem, getDefaultAuthorizedHref } from './navigation-access';

export async function requirePageAccess(locale: string, key: NavigationKey) {
  const session = await auth();

  if (!session?.user?.isAllowed) {
    redirect(`/${locale}`);
  }

  const { isAllowed, permissions } = session.user;
  if (!canAccessNavigationItem({ isAllowed, key, permissions })) {
    redirect(getDefaultAuthorizedHref({ isAllowed, locale, permissions }));
  }

  return session;
}
