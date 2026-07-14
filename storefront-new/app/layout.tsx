import type { Metadata, Viewport } from "next";

import "./globals.css";

import { getStorefrontSiteUrl } from '@/lib/product-seo';

export const metadata: Metadata = {
  metadataBase: new URL(getStorefrontSiteUrl()),
  title: {
    default: "Bricomaitre",
    template: "%s | Bricomaitre"
  },
  description: "Clean storefront rebuild for Bricomaitre."
};

export const viewport: Viewport = {
  themeColor: "#006b5f",
  colorScheme: "light"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
