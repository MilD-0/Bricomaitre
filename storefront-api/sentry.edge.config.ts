import * as Sentry from '@sentry/nextjs';
import { getSentryRelease, readSampleRate, sanitizeSentryEvent } from './lib/sentry';

const dsn = process.env.SENTRY_DSN_STOREFRONT_API?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN_STOREFRONT_API?.trim();

Sentry.init({
  dsn: dsn || undefined,
  enabled: Boolean(dsn),
  environment: process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV,
  release: getSentryRelease(),
  tracesSampleRate: readSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE_STOREFRONT_API, 0.05),
  sendDefaultPii: false,
  beforeSend: sanitizeSentryEvent,
  initialScope: {
    tags: {
      service: 'storefront-api',
    },
  },
});
