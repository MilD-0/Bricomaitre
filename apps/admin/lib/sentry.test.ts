import { describe, expect, it } from 'vitest';

import { sanitizeSentryEvent } from './sentry';

describe('admin Sentry privacy boundary', () => {
  it('removes request bodies and query details while preserving the route path', () => {
    const sanitized = sanitizeSentryEvent({
      request: {
        data: { password: 'secret' },
        url: 'https://admin.bricomaitre.com/api/orders?customer=private#detail',
        query_string: 'customer=private',
      },
      contexts: { upstream: { sourceUrl: 'https://cdn.example.test/image.jpg?signature=secret' } },
    } as never);

    expect(sanitized.request?.data).toBeUndefined();
    expect(sanitized.request?.query_string).toBeUndefined();
    expect(sanitized.request?.url).toBe('https://admin.bricomaitre.com/api/orders');
    expect(sanitized.contexts?.upstream).toEqual({
      sourceUrl: 'https://cdn.example.test/image.jpg',
    });
  });
});
