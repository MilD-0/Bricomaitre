import { describe, expect, it } from 'vitest';

import { shouldCaptureServerException } from './sentry';
import {
  getSentryRelease,
  normalizeSentryDsn,
  readSampleRate,
  sanitizeSentryEvent,
} from './sentry-config';
import { filterInjectedScriptError } from './sentry-browser-filter';

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
    });

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

  it('uses the public build release when the server-only release is unavailable', () => {
    const previousServerRelease = process.env.SENTRY_RELEASE;
    const previousPublicRelease = process.env.NEXT_PUBLIC_RELEASE;
    try {
      delete process.env.SENTRY_RELEASE;
      process.env.NEXT_PUBLIC_RELEASE = 'abc123';
      expect(getSentryRelease()).toBe('abc123');
      process.env.SENTRY_RELEASE = 'server456';
      expect(getSentryRelease()).toBe('server456');
    } finally {
      if (previousServerRelease === undefined) delete process.env.SENTRY_RELEASE;
      else process.env.SENTRY_RELEASE = previousServerRelease;
      if (previousPublicRelease === undefined) delete process.env.NEXT_PUBLIC_RELEASE;
      else process.env.NEXT_PUBLIC_RELEASE = previousPublicRelease;
    }
  });

  it('drops errors only when every stack frame belongs to a known injected script', () => {
    const injected = {
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                { filename: 'app://navigation_performance_logger_android:1:18302' },
                { filename: 'app://navigation_performance_logger_android:1:13750' },
              ],
            },
          },
        ],
      },
    };
    expect(filterInjectedScriptError(injected)).toBeNull();
    expect(
      filterInjectedScriptError({
        exception: {
          values: [
            { stacktrace: { frames: [{ filename: 'chrome-extension://extension/script.js' }] } },
          ],
        },
      }),
    ).toBeNull();
    expect(
      filterInjectedScriptError({
        exception: {
          values: [{ stacktrace: { frames: [{ filename: 'app:///fr/products/example:1:1142' }] } }],
        },
      }),
    ).toBeNull();
    const mixed = {
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                { filename: 'app://navigation_performance_logger_android:1:18302' },
                { filename: 'https://bricomaitre.com/_next/static/app.js' },
              ],
            },
          },
        ],
      },
    };
    expect(filterInjectedScriptError(mixed)).toBe(mixed);
    const stackless = { exception: { values: [{ value: 'Unexpected end of input' }] } };
    expect(filterInjectedScriptError(stackless)).toBe(stackless);
    const partlyStackless = {
      exception: {
        values: [
          { stacktrace: { frames: [{ filename: 'app:///fr/products/example:1:1142' }] } },
          { value: 'Another error' },
        ],
      },
    };
    expect(filterInjectedScriptError(partlyStackless)).toBe(partlyStackless);
  });
});
