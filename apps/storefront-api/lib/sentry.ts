import * as Sentry from '@sentry/nextjs';
import {
  getRequestId,
  readSampleRate,
  sanitizeDiagnosticEvent,
  scrubDiagnosticValue,
  withRequestIdHeaders,
} from '@bric/runtime/diagnostics';

export { getRequestId, readSampleRate, withRequestIdHeaders };

export function getSentryRelease() {
  const release = process.env.SENTRY_RELEASE?.trim();
  return release || undefined;
}

export function sanitizeSentryEvent(event: Sentry.ErrorEvent) {
  return sanitizeDiagnosticEvent(event);
}

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
