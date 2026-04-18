
import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";
import {CartContextProvider} from "./components/cartContext";
import {NextIntlClientProvider} from 'next-intl';
import {getLocale, getMessages} from 'next-intl/server';
import AnalyticsTracker from "./components/AnalyticsTracker";


const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Bricomaitre",
    template: "%s | Bricomaitre",
  },
  description: "La meuilleure boutique d'outillage en Algerie",
};
import { FacebookPixel } from "./components";
import TikTokPixel from "./components/TikTokPixel";

export default async function RootLayout({children}: {children: React.ReactNode}, ) {


  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>

      <body className={inter.className}><CartContextProvider>
      <NextIntlClientProvider messages={messages} >{children}</NextIntlClientProvider>
    <FacebookPixel /><TikTokPixel /><AnalyticsTracker /></CartContextProvider></body>
    </html>
  );
}
