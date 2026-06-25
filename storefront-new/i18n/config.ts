export const locales = ["fr", "ar"] as const;
export const defaultLocale = "fr";

export type Locale = (typeof locales)[number];

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

export function isRtl(locale: string) {
  return locale === "ar";
}
