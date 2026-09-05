type AdminCspEnv = {
  NODE_ENV?: string;
  BRIC_DEMO_MODE?: string;
  BRIC_DEMO_OBJECT_ORIGIN?: string;
  NEXT_PUBLIC_SENTRY_DSN_ADMIN?: string;
  SENTRY_DSN_ADMIN?: string;
};

function configuredOrigin(value: string | undefined) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

function configuredDemoImageOrigin(env: AdminCspEnv) {
  if (env.BRIC_DEMO_MODE?.trim().toLowerCase() !== 'true') return null;
  if (!env.BRIC_DEMO_OBJECT_ORIGIN?.trim()) return null;
  try {
    const url = new URL(env.BRIC_DEMO_OBJECT_ORIGIN.trim());
    const loopback =
      url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
    return url.protocol === 'http:' && loopback ? url.origin : null;
  } catch {
    return null;
  }
}

export function buildAdminPageContentSecurityPolicy(nonce: string, env: AdminCspEnv = process.env) {
  const sentryOrigin = configuredOrigin(env.NEXT_PUBLIC_SENTRY_DSN_ADMIN ?? env.SENTRY_DSN_ADMIN);
  const demoImageOrigin = configuredDemoImageOrigin(env);
  const connectSources = ["'self'", ...(sentryOrigin ? [sentryOrigin] : [])];
  if (env.NODE_ENV === 'development') connectSources.push('ws:', 'wss:');

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "object-src 'none'",
    `img-src 'self' data: blob: https:${demoImageOrigin ? ` ${demoImageOrigin}` : ''}`,
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
    `connect-src ${connectSources.join(' ')}`,
  ].join('; ');
}

export const ADMIN_API_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join('; ');
