import * as Sentry from '@sentry/nextjs';
import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';

const SENSITIVE_KEY_PATTERN = /(authorization|cookie|token|secret|password|passwd|session|key|dsn)/i;

function scrubValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => scrubValue(entry));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        return [key, '[REDACTED]'];
      }

      return [key, scrubValue(entry)];
    }),
  );
}

export function readSampleRate(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getSentryRelease() {
  const release = process.env.SENTRY_RELEASE?.trim();
  return release || undefined;
}

export function sanitizeSentryEvent(event: Sentry.ErrorEvent) {
  const nextEvent = scrubValue(event) as Sentry.ErrorEvent;
  if (nextEvent.request) {
    nextEvent.request.data = undefined;
  }
  return nextEvent;
}

export function getRequestId(request?: Pick<NextRequest, 'headers'> | Request) {
  const headerValue = request?.headers?.get('x-request-id')?.trim();
  return headerValue || globalThis.crypto.randomUUID();
}

export function withRequestIdHeaders(requestId: string, headers: HeadersInit = {}) {
  return {
    ...headers,
    'x-request-id': requestId,
  };
}

export function applyAdminSentryUser(session: Session | null | undefined) {
  const user = session?.user;

  if (!user) {
    Sentry.setUser(null);
    return;
  }

  Sentry.setUser({
    id: typeof user.id === 'string' ? user.id : undefined,
    email: typeof user.email === 'string' ? user.email : undefined,
  });

  if (user.role) {
    Sentry.setTag('admin_role', user.role);
  }
}

export function captureAdminException(
  error: unknown,
  options: {
    requestId: string;
    operation: string;
    session?: Session | null;
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
        email: typeof user.email === 'string' ? user.email : undefined,
      });
      if (user.role) {
        scope.setTag('admin_role', user.role);
      }
    }

    if (options.context) {
      scope.setContext('admin_request', scrubValue(options.context) as Record<string, unknown>);
    }

    Sentry.captureException(error);
  });
}
