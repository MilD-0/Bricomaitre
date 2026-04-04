import {notFound} from "next/navigation";
import {NextIntlClientProvider} from "next-intl";
import {setRequestLocale} from "next-intl/server";
import {getMessages} from "next-intl/server";

import {CartContextProvider} from "@/app/components/cartContext";
import {locales} from "@/i18n/config";

export function generateStaticParams() {
  return locales.map((locale) => ({locale}));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{locale: string}>;
}) {
  const { locale } = await params;

  if (!locales.includes(locale as (typeof locales)[number])) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <CartContextProvider locale={locale}>{children}</CartContextProvider>
    </NextIntlClientProvider>
  );
}
