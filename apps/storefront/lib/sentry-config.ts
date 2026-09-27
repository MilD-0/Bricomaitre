import { normalizeSentryDsn, readSampleRate } from '@bric/runtime/diagnostics';

export { normalizeSentryDsn, readSampleRate };

export function getSentryRelease() {
  return (
    process.env.SENTRY_RELEASE?.trim() ||
    process.env.NEXT_PUBLIC_SENTRY_RELEASE?.trim() ||
    undefined
  );
}

export { sanitizeDiagnosticEvent as sanitizeSentryEvent } from '@bric/runtime/diagnostics';
