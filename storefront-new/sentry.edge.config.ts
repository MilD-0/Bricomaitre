import * as Sentry from '@sentry/nextjs';

import { getSentryRelease, normalizeSentryDsn, readSampleRate, sanitizeSentryEvent } from './lib/sentry-config';

const dsn = normalizeSentryDsn(
  process.env.SENTRY_DSN_STOREFRONT_NEW
  || process.env.SENTRY_DSN_STOREFRONT,
);

Sentry.init({
  dsn: dsn || undefined,
  enabled: Boolean(dsn),
  environment: process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV,
  release: getSentryRelease(),
  tracesSampleRate: readSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE_STOREFRONT_NEW, 0.1),
  sendDefaultPii: false,
  beforeSend: sanitizeSentryEvent,
  initialScope: { tags: { service: 'storefront-new' } },
});
