import { notFound } from "next/navigation";
import { Inter, Noto_Sans_Arabic } from 'next/font/google';
import { setRequestLocale } from 'next-intl/server';

import { isLocale, isRtl, locales } from "@/i18n/config";

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const notoSansArabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  display: 'swap',
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
    <html lang={locale} dir={isRtl(locale) ? "rtl" : "ltr"} className={`${inter.variable} ${notoSansArabic.variable}`}>
      <body>
        {children}
      </body>
    </html>
  );
}
