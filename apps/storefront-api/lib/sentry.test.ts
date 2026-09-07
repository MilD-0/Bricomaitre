import { describe, expect, it, vi } from 'vitest';

const init = vi.hoisted(() => vi.fn());
const diagnostics = vi.hoisted(() => ({
  captureException: vi.fn(),
  scope: { setTag: vi.fn(), setContext: vi.fn() },
}));
vi.mock('@sentry/nextjs', () => ({
  init,
  captureException: diagnostics.captureException,
  withScope: (callback: (scope: typeof diagnostics.scope) => void) => callback(diagnostics.scope),
}));

import '../sentry.server.config';
import { captureStorefrontApiException } from './sentry';

describe('storefront API Sentry privacy boundary', () => {
  it('correlates exceptions without leaking private request context', () => {
    const error = new Error('catalog unavailable');
    captureStorefrontApiException(error, {
      requestId: 'request-123',
      operation: 'lookup',
      route: '/storefront/orders/track',
      context: { token: 'private-order-token', phone: '0550000000', itemCount: 2 },
    });
    expect(diagnostics.captureException).toHaveBeenCalledWith(error);
    expect(diagnostics.scope.setTag).toHaveBeenCalledWith('request_id', 'request-123');
    expect(diagnostics.scope.setTag).toHaveBeenCalledWith('route', '/storefront/orders/track');
    const [name, context] = diagnostics.scope.setContext.mock.calls[0]!;
    expect(name).toBe('storefront_request');
    expect(context.itemCount).toBe(2);
    expect(JSON.stringify(context)).not.toContain('private-order-token');
    expect(JSON.stringify(context)).not.toContain('0550000000');
  });
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
