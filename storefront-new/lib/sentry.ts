import * as Sentry from '@sentry/nextjs';

const SENSITIVE_KEY_PATTERN = /(authorization|cookie|access.?token|auth.?token|order.?token|secret|password|passwd|phone|email|address|dsn)/i;

function scrubValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubValue);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
    key,
    SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : scrubValue(entry),
  ]));
}

export function readSampleRate(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

export function getSentryRelease() {
  return process.env.SENTRY_RELEASE?.trim() || undefined;
}

export function shouldCaptureServerException(
  env: NodeJS.ProcessEnv = process.env,
) {
  if (env.NEXT_PHASE === 'phase-production-build') return false;
  return Boolean(
    env.SENTRY_DSN_STOREFRONT_NEW?.trim()
    || env.SENTRY_DSN_STOREFRONT?.trim(),
  );
}

export function sanitizeSentryEvent(event: Sentry.ErrorEvent) {
  const sanitized = scrubValue(event) as Sentry.ErrorEvent;
  if (sanitized.request) sanitized.request.data = undefined;
  return sanitized;
}

export function captureProductPageException(error: unknown, context: {
  locale: string;
  requestedToken: string;
  operation: string;
}) {
  if (!shouldCaptureServerException()) return;
  Sentry.withScope((scope) => {
    scope.setTag('page_type', 'product_detail');
    scope.setTag('locale', context.locale);
    scope.setTag('operation', context.operation);
    scope.setContext('product', { requestedToken: context.requestedToken });
    Sentry.captureException(error);
  });
}

export function captureCatalogPageException(error: unknown, context: {
  locale: string;
  operation: string;
}) {
  if (!shouldCaptureServerException()) return;
  Sentry.withScope((scope) => {
    scope.setTag('page_type', 'catalog');
    scope.setTag('locale', context.locale);
    scope.setTag('operation', context.operation);
    Sentry.captureException(error);
  });
}
