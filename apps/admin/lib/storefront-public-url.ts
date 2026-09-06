const DEFAULT_PUBLIC_ORIGIN = 'https://bricomaitre.com';

/** Browser destinations are distinct from internal service/revalidation addresses. */
export function getStorefrontPublicBaseUrl() {
  // Indirection keeps the server value runtime-configurable in promoted images.
  const key = 'NEXT_PUBLIC_STOREFRONT_BASE_URL';
  return (process.env[key]?.trim() || DEFAULT_PUBLIC_ORIGIN).replace(/\/+$/, '');
}
