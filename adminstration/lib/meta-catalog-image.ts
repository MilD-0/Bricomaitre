function normalizeBaseUrl(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function toVersionParam(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? String(timestamp) : undefined;
}

export function getAdminBaseUrl() {
  return normalizeBaseUrl(process.env.NEXTAUTH_URL ?? 'http://localhost:3000');
}

export function buildMetaCatalogImageUrl(productId: number, updatedAt: string | Date) {
  const searchParams = new URLSearchParams();
  const version = toVersionParam(updatedAt);
  if (version) {
    searchParams.set('v', version);
  }

  const query = searchParams.toString();
  return `${getAdminBaseUrl()}/api/products/meta-image/${productId}${query ? `?${query}` : ''}`;
}
