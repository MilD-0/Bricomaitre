import * as Sentry from '@sentry/nextjs';

import { normalizeSentryDsn } from './sentry-config';

export function shouldCaptureServerException(
  env: NodeJS.ProcessEnv = process.env,
) {
  if (env.NEXT_PHASE === 'phase-production-build') return false;
  return Boolean(normalizeSentryDsn(
    env.SENTRY_DSN_STOREFRONT_NEW
    || env.SENTRY_DSN_STOREFRONT,
  ));
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
