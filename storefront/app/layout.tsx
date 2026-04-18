import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import {getLocale, getMessages} from 'next-intl/server';

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
import StorefrontProviders from "./StorefrontProviders";


const appFont = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-app",
});

const BRAND_THEME_COLOR = "#007f86";

export const viewport: Viewport = {
  themeColor: BRAND_THEME_COLOR,
  colorScheme: "light",
};

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: SITE_TITLE,
    template: "%s | Bricomaitre",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  manifest: "/manifest.webmanifest",
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
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
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
    ],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    other: [
      {
        rel: "mask-icon",
        url: "/safari-pinned-tab.svg",
        color: BRAND_THEME_COLOR,
      },
    ],
  },
};
import { FacebookPixel } from "./components";
import AnalyticsTracker from "./components/AnalyticsTracker";
import CoreWebVitals from "./components/CoreWebVitals";
import GoogleAnalytics from "./components/GoogleAnalytics";

export default async function RootLayout({children}: {children: React.ReactNode}, ) {
  const locale = await getLocale();
  const messages = await getMessages();
  const cloudfrontOrigin = getCloudfrontOrigin();

  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <head>
        {cloudfrontOrigin ? (
          <link rel="preconnect" href={cloudfrontOrigin.origin} crossOrigin="" />
        ) : null}
      </head>
      <body className={appFont.className}>
        <StorefrontProviders locale={locale} messages={messages}>
          {children}
        </StorefrontProviders>
        <FacebookPixel />
        <GoogleAnalytics />
        <AnalyticsTracker />
        <CoreWebVitals />
      </body>
    </html>
  );
}
