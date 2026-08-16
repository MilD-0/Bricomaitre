import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

describe('POST /api/marketing/meta', () => {
  beforeEach(() => {
    process.env.STOREFRONT_META_PROXY_SECRET = 'proxy-secret';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    delete process.env.STOREFRONT_META_PROXY_SECRET;
    vi.unstubAllGlobals();
  });

  it('forwards attribution headers and the governed body to storefront-api', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('{"ok":true}', { status: 202, headers: { 'content-type': 'application/json' } }),
    );
    const body = JSON.stringify({ eventId: 'event-1', eventName: 'PageView' });
    const response = await POST(
      new NextRequest('http://localhost/api/marketing/meta', {
        method: 'POST',
        body,
        headers: {
          cookie: '_fbp=fb.1.1.1',
          'user-agent': 'phone',
          'x-forwarded-for': '203.0.113.4',
        },
      }),
    );
    expect(response.status).toBe(202);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/storefront/meta/events',
      expect.objectContaining({
        method: 'POST',
        body,
        headers: expect.objectContaining({
          cookie: '_fbp=fb.1.1.1',
          'user-agent': 'phone',
          'x-storefront-meta-proxy-secret': 'proxy-secret',
        }),
      }),
    );
  });

  it('fails non-fatally when the optional destination path is unavailable', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('offline'));
    const response = await POST(
      new NextRequest('http://localhost/api/marketing/meta', { method: 'POST', body: '{}' }),
    );
    expect(response.status).toBe(503);
  });
});
