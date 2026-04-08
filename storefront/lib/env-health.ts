import {
  getStorefrontApiBaseUrl,
  isUsingDefaultStorefrontApiBaseUrl,
} from "@/lib/storefront-upstream";

export function getStorefrontEnvHealth(env: NodeJS.ProcessEnv = process.env) {
  const missing: string[] = [];

  if (!env.STOREFRONT_API_BASE_URL?.trim()) {
    missing.push("STOREFRONT_API_BASE_URL");
  }

  if (!env.STOREFRONT_REVALIDATE_SECRET?.trim()) {
    missing.push("STOREFRONT_REVALIDATE_SECRET");
  }

  return {
    ok: missing.length === 0,
    missing,
    checks: {
      storefrontApiBaseUrl: getStorefrontApiBaseUrl(),
      storefrontApiConfigured: !isUsingDefaultStorefrontApiBaseUrl(),
      siteUrlConfigured: Boolean(env.SITE_URL?.trim() || env.NEXT_PUBLIC_SITE_URL?.trim()),
      revalidationConfigured: Boolean(env.STOREFRONT_REVALIDATE_SECRET?.trim()),
    },
  };
}
