import { describe, expect, it } from 'vitest';

import {
  getRequestId,
  normalizeSentryDsn,
  readSampleRate,
  sanitizeDiagnosticEvent,
  withRequestIdHeaders,
} from './diagnostics';

describe('runtime diagnostics', () => {
  it('redacts credentials and PII while stripping URL query details', () => {
    expect(
      sanitizeDiagnosticEvent({
        request: {
          data: { password: 'secret' },
          query_string: 'token=secret',
          url: 'https://example.com/orders/4?token=secret',
        },
        context: {
          requestedToken: 'desk-lamp',
          email: 'customer@example.com',
          nested: { phoneNumber: '0555000000', orderAccessToken: 'secret' },
        },
      }),
    ).toEqual({
      request: { data: undefined, query_string: undefined, url: 'https://example.com/orders/4' },
      context: {
        requestedToken: 'desk-lamp',
        email: '[REDACTED]',
        nested: { phoneNumber: '[REDACTED]', orderAccessToken: '[REDACTED]' },
      },
    });
  });

  it('accepts only bounded sample rates', () => {
    expect(readSampleRate('0.25', 0.1)).toBe(0.25);
    expect(readSampleRate('-1', 0.1)).toBe(0.1);
    expect(readSampleRate('2', 0.1)).toBe(0.1);
    expect(readSampleRate('invalid', 0.1)).toBe(0.1);
  });

  it('normalizes only valid HTTPS Sentry DSNs', () => {
    const dsn = 'https://public@example.ingest.sentry.io/123';
    expect(normalizeSentryDsn(`"${dsn}"`)).toBe(dsn);
    expect(normalizeSentryDsn('http://public@example.ingest.sentry.io/123')).toBeUndefined();
    expect(normalizeSentryDsn('https://example.ingest.sentry.io/no-project')).toBeUndefined();
  });

  it('preserves inbound request IDs and attaches response IDs', () => {
    expect(getRequestId({ headers: new Headers({ 'x-request-id': ' request-7 ' }) })).toBe(
      'request-7',
    );
    expect(withRequestIdHeaders('request-7', { 'cache-control': 'no-store' })).toEqual({
      'cache-control': 'no-store',
      'x-request-id': 'request-7',
    });
  });
});
