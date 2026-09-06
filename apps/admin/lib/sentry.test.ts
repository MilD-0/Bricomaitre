import { describe, expect, it, vi } from 'vitest';

const init = vi.hoisted(() => vi.fn());
vi.mock('@sentry/nextjs', () => ({ init }));

import '../sentry.server.config';

describe('admin Sentry privacy boundary', () => {
  it('installs a server hook that removes private data before sending events', () => {
    expect(init).toHaveBeenCalledOnce();
    const config = init.mock.calls[0]![0];
    expect(config.sendDefaultPii).toBe(false);
    expect(config.beforeSend).toBeTypeOf('function');
    const sanitized = config.beforeSend({
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
