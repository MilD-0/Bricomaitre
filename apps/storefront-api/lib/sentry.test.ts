import { describe, expect, it, vi } from 'vitest';

const init = vi.hoisted(() => vi.fn());
vi.mock('@sentry/nextjs', () => ({ init }));

import '../sentry.server.config';

describe('storefront API Sentry privacy boundary', () => {
  it('installs a server hook that removes private data before sending events', () => {
    expect(init).toHaveBeenCalledOnce();
    const config = init.mock.calls[0]![0];
    expect(config.sendDefaultPii).toBe(false);
    expect(config.beforeSend).toBeTypeOf('function');
    const sanitized = config.beforeSend({
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
