import {
  normalizeStorefrontProject,
  resolveRequestedStorefrontProject,
  STOREFRONT_PROJECT_COOKIE_NAME,
  type StorefrontProject,
} from "@bric/storefront-core/project-routing";

function readCookieValue(name: string) {
  if (typeof document === "undefined") {
    return null;
  }

  const cookie = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`));

  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

export function readStorefrontProjectCookie(): StorefrontProject | null {
  return normalizeStorefrontProject(readCookieValue(STOREFRONT_PROJECT_COOKIE_NAME));
}

export function getRequestedStorefrontProject(): StorefrontProject {
  if (typeof window === "undefined") {
    return "new";
  }

  const params = new URLSearchParams(window.location.search);

  return resolveRequestedStorefrontProject({
    queryValue: params.get("sf_variant"),
    cookieValue: readCookieValue(STOREFRONT_PROJECT_COOKIE_NAME),
  });
}
