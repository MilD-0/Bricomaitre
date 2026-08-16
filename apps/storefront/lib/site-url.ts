const DEFAULT_SITE_URL = 'https://bricomaitre.com';

export function getStorefrontSiteUrl(env: NodeJS.ProcessEnv = process.env) {
  const configured = env.NEXT_PUBLIC_SITE_URL?.trim() || env.SITE_URL?.trim();
  return (configured || DEFAULT_SITE_URL).replace(/\/+$/, '');
}
