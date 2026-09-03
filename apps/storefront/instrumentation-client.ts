import {
  getSentryRelease,
  normalizeSentryDsn,
  readSampleRate,
  sanitizeSentryEvent,
} from './lib/sentry-config';

const dsn = normalizeSentryDsn(process.env.NEXT_PUBLIC_SENTRY_DSN_STOREFRONT);

type SentryClient = typeof import('@sentry/nextjs');
type BufferedException = { error: unknown; mechanism: 'error' | 'unhandledrejection' };

const bufferedExceptions: BufferedException[] = [];
let sentryPromise: Promise<SentryClient> | null = null;
let sentryClient: SentryClient | null = null;

function initializeSentryClient() {
  if (!dsn) return Promise.resolve(null);
  if (sentryPromise) return sentryPromise;

  sentryPromise = import('@sentry/nextjs').then((Sentry) => {
    Sentry.init({
      dsn,
      enabled: true,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV,
      release: getSentryRelease(),
      tracesSampleRate: readSampleRate(
        process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE_STOREFRONT,
        0.1,
      ),
      sendDefaultPii: false,
      integrations: [
        Sentry.browserTracingIntegration({
          // The SDK loads only after an exception. Starting a page-load span
          // then would measure the deferral rather than the page load.
          instrumentPageLoad: false,
          instrumentNavigation: true,
        }),
      ],
      beforeSend: sanitizeSentryEvent,
      initialScope: { tags: { service: 'storefront' } },
    });
    sentryClient = Sentry;
    bufferedExceptions.splice(0).forEach(({ error, mechanism }) => {
      Sentry.captureException(error, { mechanism: { type: mechanism, handled: false } });
    });
    return Sentry;
  });
  return sentryPromise;
}

if (dsn && typeof window !== 'undefined') {
  const captureError = (event: ErrorEvent) => {
    if (sentryClient) {
      sentryClient.captureException(event.error ?? event.message, {
        mechanism: { type: 'error', handled: false },
      });
      return;
    }
    bufferedExceptions.push({ error: event.error ?? event.message, mechanism: 'error' });
    void initializeSentryClient();
  };
  const captureRejection = (event: PromiseRejectionEvent) => {
    if (sentryClient) {
      sentryClient.captureException(event.reason, {
        mechanism: { type: 'unhandledrejection', handled: false },
      });
      return;
    }
    bufferedExceptions.push({ error: event.reason, mechanism: 'unhandledrejection' });
    void initializeSentryClient();
  };
  window.addEventListener('error', captureError);
  window.addEventListener('unhandledrejection', captureRejection);
}

export function onRouterTransitionStart(
  ...args: Parameters<SentryClient['captureRouterTransitionStart']>
) {
  // A normal interaction must not download and evaluate the monitoring SDK.
  // If an error already initialized Sentry, keep tracing that broken session.
  sentryClient?.captureRouterTransitionStart(...args);
}
