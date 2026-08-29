import { notFound } from 'next/navigation';
import { headers } from 'next/headers';

import { AppProviders } from '../../providers/app-providers';
import { isRtl, locales } from '../../lib/i18n';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const [{ locale }, requestHeaders] = await Promise.all([params, headers()]);

  if (!locales.includes(locale as (typeof locales)[number])) notFound();

  const messages = (await import(`../../messages/${locale}.json`)).default;

  return (
    <html lang={locale} dir={isRtl(locale) ? 'rtl' : 'ltr'} suppressHydrationWarning>
      <body>
        <AppProviders
          locale={locale}
          messages={messages}
          nonce={requestHeaders.get('x-nonce') ?? undefined}
        >
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
