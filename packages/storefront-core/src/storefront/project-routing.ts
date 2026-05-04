export const STOREFRONT_PROJECT_COOKIE_NAME = "bric_storefront_project";

export type StorefrontProject = "new";

export function normalizeStorefrontProject(value?: string | null): StorefrontProject | null {
  const raw = value?.trim().toLowerCase();
  if (!raw) {
    return null;
  }

  if (raw === "new" || raw === "fast_checkout" || raw === "legacy") {
    return "new";
  }

  return null;
}

export function resolveRequestedStorefrontProject(options?: {
  queryValue?: string | null;
  cookieValue?: string | null;
}): StorefrontProject {
  const normalizedQuery = normalizeStorefrontProject(options?.queryValue ?? null);
  if (normalizedQuery) {
    return normalizedQuery;
  }

  const normalizedCookie = normalizeStorefrontProject(options?.cookieValue ?? null);
  if (normalizedCookie) {
    return normalizedCookie;
  }

  return "new";
}
