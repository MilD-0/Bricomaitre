'use client';

import { useParams } from 'next/navigation';

import { StorefrontFailure } from '@/components/storefront-failure';
import { isLocale } from '@/i18n/config';

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ locale?: string }>();
  const localeParam = params.locale;
  const locale = localeParam && isLocale(localeParam) ? localeParam : 'fr';
  void error;

  return <StorefrontFailure kind="error" locale={locale} onRetry={reset} />;
}
