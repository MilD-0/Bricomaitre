import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

describe('POST /api/analytics', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forwards first-party events to the canonical API without caching', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const body = JSON.stringify({ eventVersion: 1, eventName: 'view_item' });

    const response = await POST(
      new NextRequest('http://localhost/api/analytics', {
        method: 'POST',
        body,
      }),
    );

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/storefront/analytics',
      expect.objectContaining({ method: 'POST', body, cache: 'no-store' }),
    );
  });

  it('accepts events non-fatally when analytics upstream is unavailable', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('connection refused'));

    const response = await POST(
      new NextRequest('http://localhost/api/analytics', {
        method: 'POST',
        body: '{}',
      }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ ok: false, accepted: true });
  });

  it('rejects oversized public payloads before forwarding', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/analytics', {
        method: 'POST',
        body: 'x'.repeat(16_385),
      }),
    );

    expect(response.status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
});
