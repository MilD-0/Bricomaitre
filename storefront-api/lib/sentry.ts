import * as Sentry from '@sentry/nextjs';
import type { NextRequest } from 'next/server';

const SENSITIVE_KEY_PATTERN = /(authorization|cookie|token|secret|password|passwd|key|dsn)/i;

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
  const headerValue = request?.headers.get('x-request-id')?.trim();
  if (headerValue) {
    return headerValue;
  }

  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function withRequestIdHeaders(requestId: string, headers: HeadersInit = {}) {
  return {
    ...headers,
    'x-request-id': requestId,
  };
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
      scope.setContext('storefront_request', scrubValue(options.context) as Record<string, unknown>);
    }
    Sentry.captureException(error);
  });
}
