import * as Sentry from '@sentry/nextjs';

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
