import { notFound } from "next/navigation";
import { IBM_Plex_Sans_Arabic, Inter } from 'next/font/google';
import { setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';

import { isLocale, isRtl, locales } from "@/i18n/config";
import { MarketingPixels } from '@/components/marketing-pixels';
import { PageViewTelemetry } from '@/components/page-view-telemetry';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['100', '200', '300', '400', '500', '600', '700'],
  display: 'swap',
  preload: false,
  variable: '--font-arabic',
});

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params
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
      dir={isRtl(locale) ? "rtl" : "ltr"}
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
