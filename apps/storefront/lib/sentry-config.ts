import type { ErrorEvent } from '@sentry/nextjs';
import {
  normalizeSentryDsn,
  readSampleRate,
  sanitizeDiagnosticEvent,
} from '@bric/runtime/diagnostics';

export { normalizeSentryDsn, readSampleRate };

export function getSentryRelease() {
  return process.env.SENTRY_RELEASE?.trim() || undefined;
}

export function sanitizeSentryEvent(event: ErrorEvent) {
  return sanitizeDiagnosticEvent(event);
}
