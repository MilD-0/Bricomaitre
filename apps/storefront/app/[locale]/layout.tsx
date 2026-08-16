import { notFound } from 'next/navigation';
import localFont from 'next/font/local';
import { setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';

import { isLocale, isRtl, locales } from '@/i18n/config';
import { MarketingPixels } from '@/components/marketing-pixels';
import { PageViewTelemetry } from '@/components/page-view-telemetry';

const inter = localFont({
  src: '../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-inter',
});

const ibmPlexSansArabic = localFont({
  src: [
    {
      path: '../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2',
      weight: '400',
    },
    {
      path: '../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-500-normal.woff2',
      weight: '500',
    },
    {
      path: '../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal.woff2',
      weight: '600',
    },
    {
      path: '../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-700-normal.woff2',
      weight: '700',
    },
  ],
  display: 'swap',
  preload: false,
  variable: '--font-arabic',
});

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      dir={isRtl(locale) ? 'rtl' : 'ltr'}
      className={`${inter.variable}${locale === 'ar' ? ` ${ibmPlexSansArabic.variable}` : ''}`}
    >
      <body>
        <MarketingPixels />
        <Suspense fallback={null}>
          <PageViewTelemetry locale={locale} />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
