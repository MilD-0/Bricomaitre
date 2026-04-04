import { getRequestConfig } from 'next-intl/server';

import { defaultLocale, locales } from '@/lib/i18n';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = locales.includes(requested as (typeof locales)[number])
    ? (requested as (typeof locales)[number])
    : defaultLocale;

  return {
    locale,
    timeZone: "UTC",
    messages: (await import(`@/messages/${locale}.json`)).default,
  };
});
