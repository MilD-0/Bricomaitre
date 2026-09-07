'use client';

import { usePathname, useSearchParams } from 'next/navigation';

import type { Locale } from '@/i18n/config';

export function useLocaleHref(locale: Locale, alternatePath?: string) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return `${alternatePath ?? pathname.replace(/^\/(fr|ar)(?=\/|$)/, `/${locale}`)}${searchParams.size ? `?${searchParams}` : ''}`;
}

export function FooterLocaleNavigation({
  locale,
  alternatePath,
  label,
}: {
  locale: Locale;
  alternatePath?: string;
  label: string;
}) {
  const frenchHref = useLocaleHref('fr', locale === 'ar' ? alternatePath : undefined);
  const arabicHref = useLocaleHref('ar', locale === 'fr' ? alternatePath : undefined);

  return (
    <div aria-label={label}>
      <a href={frenchHref} hrefLang="fr" aria-current={locale === 'fr' ? 'page' : undefined}>
        FR
      </a>
      <a href={arabicHref} hrefLang="ar" aria-current={locale === 'ar' ? 'page' : undefined}>
        العربية
      </a>
    </div>
  );
}
