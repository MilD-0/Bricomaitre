import { getStorefrontPublicBaseUrl } from './storefront-public-url';
const DEFAULT_STOREFRONT_BASE_URL = 'https://bricomaitre.com';

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

export function buildOrderTrackingUrl(
  publicToken: string | null | undefined,
  locale: string,
  baseUrl = getStorefrontPublicBaseUrl(),
) {
  const token = publicToken?.trim();
  if (!token) return null;

  const storefrontLocale = locale === 'ar' ? 'ar' : 'fr';
  const origin = normalizeBaseUrl(baseUrl?.trim() || DEFAULT_STOREFRONT_BASE_URL);
  return `${origin}/${storefrontLocale}/thank-you?token=${encodeURIComponent(token)}`;
}
