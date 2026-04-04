export type Locale = (typeof locales)[number];

export const locales = ["fr", "ar"] as const;
export const defaultLocale: Locale = "ar";

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}
