import { describe, expect, it } from 'vitest';

import { sanitizeSentryEvent } from './sentry';

describe('storefront API Sentry privacy boundary', () => {
  it('removes request bodies and query details while preserving the route path', () => {
    const sanitized = sanitizeSentryEvent({
      request: {
        data: { phone: '0550000000' },
        url: 'https://api.bricomaitre.com/storefront/orders?accessToken=secret#result',
        query_string: { accessToken: 'secret' },
      },
      extra: { callbackUrl: 'https://example.test/complete?token=secret' },
    } as never);

    expect(sanitized.request?.data).toBeUndefined();
    expect(sanitized.request?.query_string).toBeUndefined();
    expect(sanitized.request?.url).toBe('https://api.bricomaitre.com/storefront/orders');
    expect(sanitized.extra?.callbackUrl).toBe('https://example.test/complete');
  });
});
