import {getRequestConfig} from "next-intl/server";
import {cookies} from "next/headers";

import {defaultLocale, isLocale} from "./config";

const LOCALE_COOKIE_NAME = "lo";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  const locale = cookieLocale && isLocale(cookieLocale) ? cookieLocale : defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
