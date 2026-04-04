import type { Metadata } from "next";
import localFont from "next/font/local";
import {getLocale} from 'next-intl/server';

import "./globals.css";
import {
  buildCanonicalUrl,
  buildRobots,
  getSiteUrl,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
} from "@/lib/seo";
import { getCloudfrontOrigin } from "@/lib/cdn";


const appFont = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-app",
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: SITE_TITLE,
    template: "%s | Bricomaitre",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: {
    canonical: buildCanonicalUrl("/"),
  },
  keywords: [
    "Bricomaitre",
    "outillage",
    "bricolage",
    "equipement",
    "Algerie",
    "quincaillerie",
  ],
  robots: buildRobots(false),
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: buildCanonicalUrl("/"),
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: buildCanonicalUrl("/opengraph-image.png"),
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [buildCanonicalUrl("/opengraph-image.png")],
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-icon.png",
  },
};
import { FacebookPixel } from "./components";
import AnalyticsTracker from "./components/AnalyticsTracker";
import CoreWebVitals from "./components/CoreWebVitals";
import GoogleAnalytics from "./components/GoogleAnalytics";

export default async function RootLayout({children}: {children: React.ReactNode}, ) {
  const locale = await getLocale();
  const cloudfrontOrigin = getCloudfrontOrigin();

  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <head>
        {cloudfrontOrigin ? (
          <link rel="preconnect" href={cloudfrontOrigin.origin} crossOrigin="" />
        ) : null}
      </head>
      <body className={appFont.className}>
        {children}
        <FacebookPixel />
        <GoogleAnalytics />
        <AnalyticsTracker />
        <CoreWebVitals />
      </body>
    </html>
  );
}
