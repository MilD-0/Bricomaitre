import {
  getRequestId,
  readSampleRate,
  scrubDiagnosticValue,
  withRequestIdHeaders,
} from '@bric/runtime/diagnostics';
import * as Sentry from '@sentry/nextjs';

export { getRequestId, readSampleRate, withRequestIdHeaders };

export function getSentryRelease() {
  const release = process.env.SENTRY_RELEASE?.trim();
  return release || undefined;
}

export { sanitizeDiagnosticEvent as sanitizeSentryEvent } from '@bric/runtime/diagnostics';

export function captureStorefrontApiException(
  error: unknown,
  options: {
    requestId: string;
    operation: string;
    route?: string;
    context?: Record<string, unknown>;
  },
) {
  Sentry.withScope((scope) => {
    scope.setTag('service', 'storefront-api');
    scope.setTag('operation', options.operation);
    scope.setTag('request_id', options.requestId);
    if (options.route) {
      scope.setTag('route', options.route);
    }
    if (options.context) {
      scope.setContext(
        'storefront_request',
        scrubDiagnosticValue(options.context) as Record<string, unknown>,
      );
    }
    Sentry.captureException(error);
  });
}
