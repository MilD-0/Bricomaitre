import { getLocale } from 'next-intl/server';

import { StorefrontFailure } from '@/components/storefront-failure';
import { isLocale } from '@/i18n/config';

export default async function LocaleNotFound() {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : 'fr';

  return <StorefrontFailure kind="not-found" locale={locale} />;
}
