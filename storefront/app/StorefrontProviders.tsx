import { NextIntlClientProvider } from "next-intl";

import { CartContextProvider } from "@/app/components/cartContext";

export default function StorefrontProviders({
  children,
  locale,
  messages,
}: {
  children: React.ReactNode;
  locale: string;
  messages: Record<string, unknown>;
}) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <CartContextProvider locale={locale}>{children}</CartContextProvider>
    </NextIntlClientProvider>
  );
}
