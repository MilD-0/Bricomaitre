import * as Sentry from '@sentry/nextjs';
import {
  getRequestId,
  readSampleRate,
  sanitizeDiagnosticEvent,
  scrubDiagnosticValue,
  withRequestIdHeaders,
} from '@bric/runtime/diagnostics';
import type { AdminSession } from './auth';

export { getRequestId, readSampleRate, withRequestIdHeaders };

export function getSentryRelease() {
  const release = process.env.SENTRY_RELEASE?.trim();
  return release || undefined;
}

export function sanitizeSentryEvent(event: Sentry.ErrorEvent) {
  return sanitizeDiagnosticEvent(event);
}

export function captureAdminException(
  error: unknown,
  options: {
    requestId: string;
    operation: string;
    session?: AdminSession | null;
    route?: string;
    context?: Record<string, unknown>;
  },
) {
  Sentry.withScope((scope) => {
    scope.setTag('service', 'admin');
    scope.setTag('operation', options.operation);
    scope.setTag('request_id', options.requestId);
    if (options.route) {
      scope.setTag('route', options.route);
    }

    const user = options.session?.user;
    if (user) {
      scope.setUser({
        id: typeof user.id === 'string' ? user.id : undefined,
      });
      if (user.role) {
        scope.setTag('admin_role', user.role);
      }
    }

    if (options.context) {
      scope.setContext(
        'admin_request',
        scrubDiagnosticValue(options.context) as Record<string, unknown>,
      );
    }

    Sentry.captureException(error);
  });
}
