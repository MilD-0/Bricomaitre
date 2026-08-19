import { cookies } from 'next/headers';

import { ADMIN_LEGACY_UI_COOKIE, parseLegacyUiPreference } from './admin-ui-preference';

export async function readLegacyUiPreference() {
  const cookieStore = await cookies();
  return parseLegacyUiPreference(cookieStore.get(ADMIN_LEGACY_UI_COOKIE)?.value);
}
