import * as Sentry from '@sentry/nextjs';

import { getSentryRelease, readSampleRate, sanitizeSentryEvent } from './lib/sentry';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN_STOREFRONT_NEW?.trim()
  || process.env.NEXT_PUBLIC_SENTRY_DSN_STOREFRONT?.trim();

Sentry.init({
  dsn: dsn || undefined,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV,
  release: getSentryRelease(),
  tracesSampleRate: readSampleRate(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE_STOREFRONT_NEW, 0.1),
  sendDefaultPii: false,
  beforeSend: sanitizeSentryEvent,
  initialScope: { tags: { service: 'storefront-new' } },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
