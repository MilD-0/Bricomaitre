import { describe, expect, it } from 'vitest';

import { readSampleRate, sanitizeSentryEvent } from './sentry';

describe('storefront-new Sentry privacy boundary', () => {
  it('keeps safe product correlation while redacting sensitive context and request bodies', () => {
    const sanitized = sanitizeSentryEvent({
      request: { data: { phone: '0550000000' } },
      contexts: {
        product: { requestedToken: 'desk-lamp' },
        checkout: { phone: '0550000000', orderAccessToken: 'secret-value' },
      },
    } as never);

    expect(sanitized.request?.data).toBeUndefined();
    expect(sanitized.contexts?.product).toEqual({ requestedToken: 'desk-lamp' });
    expect(sanitized.contexts?.checkout).toEqual({ phone: '[REDACTED]', orderAccessToken: '[REDACTED]' });
  });

  it('rejects invalid trace sample rates', () => {
    expect(readSampleRate('0.25', 0.1)).toBe(0.25);
    expect(readSampleRate('2', 0.1)).toBe(0.1);
    expect(readSampleRate('invalid', 0.1)).toBe(0.1);
  });
});
