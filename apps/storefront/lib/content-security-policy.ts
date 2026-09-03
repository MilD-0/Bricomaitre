type StorefrontCspEnv = {
  NODE_ENV?: string;
  NEXT_PUBLIC_FACEBOOK_PIXEL_ID?: string;
  NEXT_PUBLIC_SENTRY_DSN_STOREFRONT?: string;
};

function hasValue(value: string | undefined) {
  return Boolean(value?.trim());
}

function tlsOrigin(value: string | undefined) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

export function buildStorefrontContentSecurityPolicy(
  imageOrigins: readonly string[],
  env: StorefrontCspEnv = process.env,
) {
  const scriptSources = ["'self'", "'unsafe-inline'"];
  const connectSources = ["'self'"];

  if (env.NODE_ENV === 'development') {
    scriptSources.push("'unsafe-eval'");
    connectSources.push('ws:', 'wss:');
  }
  if (hasValue(env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID)) {
    scriptSources.push('https://connect.facebook.net');
    connectSources.push('https://www.facebook.com');
  }
  const sentryOrigin = tlsOrigin(env.NEXT_PUBLIC_SENTRY_DSN_STOREFRONT);
  if (sentryOrigin) connectSources.push(sentryOrigin);

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    `img-src 'self' data: blob: https:${imageOrigins.length ? ` ${imageOrigins.join(' ')}` : ''}`,
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSources.join(' ')}`,
    `connect-src ${Array.from(new Set(connectSources)).join(' ')}`,
  ].join('; ');
}
