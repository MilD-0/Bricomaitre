const DEFAULT_STOREFRONT_API_BASE_URL = 'http://localhost:3001';

function normalizeBaseUrl(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function getStorefrontApiBaseUrl() {
  return normalizeBaseUrl(process.env.STOREFRONT_API_BASE_URL ?? DEFAULT_STOREFRONT_API_BASE_URL);
}
