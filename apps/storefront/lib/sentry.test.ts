import { describe, expect, it } from 'vitest';

import { normalizeSentryDsn, readSampleRate, sanitizeSentryEvent } from './sentry-config';
import { shouldCaptureServerException } from './sentry';

describe('storefront Sentry privacy boundary', () => {
  it('does not generate exception event identifiers during production prerendering', () => {
    expect(
      shouldCaptureServerException({
        NEXT_PHASE: 'phase-production-build',
        SENTRY_DSN_STOREFRONT: 'https://public@example.ingest.sentry.io/1',
      }),
    ).toBe(false);
    expect(
      shouldCaptureServerException({
        SENTRY_DSN_STOREFRONT: 'https://public@example.ingest.sentry.io/1',
      }),
    ).toBe(true);
    expect(shouldCaptureServerException({})).toBe(false);
  });

  it('keeps safe product correlation while redacting sensitive context and request bodies', () => {
    const sanitized = sanitizeSentryEvent({
      request: {
        data: { phone: '0550000000' },
        url: 'https://bricomaitre.com/fr/order-tracking?token=secret#details',
        query_string: 'token=secret',
      },
      contexts: {
        product: { requestedToken: 'desk-lamp' },
        checkout: { phone: '0550000000', orderAccessToken: 'secret-value' },
      },
    } as never);

    expect(sanitized.request?.data).toBeUndefined();
    expect(sanitized.request?.url).toBe('https://bricomaitre.com/fr/order-tracking');
    expect(sanitized.request?.query_string).toBeUndefined();
    expect(sanitized.contexts?.product).toEqual({ requestedToken: 'desk-lamp' });
    expect(sanitized.contexts?.checkout).toEqual({
      phone: '[REDACTED]',
      orderAccessToken: '[REDACTED]',
    });
  });

  it('rejects invalid trace sample rates', () => {
    expect(readSampleRate('0.25', 0.1)).toBe(0.25);
    expect(readSampleRate('2', 0.1)).toBe(0.1);
    expect(readSampleRate('invalid', 0.1)).toBe(0.1);
  });

  it('normalizes quoted deployment secrets and rejects malformed DSNs before SDK initialization', () => {
    const dsn = 'https://public@example.ingest.sentry.io/123';
    expect(normalizeSentryDsn(`"${dsn}"`)).toBe(dsn);
    expect(normalizeSentryDsn(`'${dsn}'`)).toBe(dsn);
    expect(normalizeSentryDsn('https://example.ingest.sentry.io/not-a-project')).toBeUndefined();
    expect(normalizeSentryDsn('not-a-url')).toBeUndefined();
    expect(shouldCaptureServerException({ SENTRY_DSN_STOREFRONT: '"not-a-url"' })).toBe(false);
  });
});
