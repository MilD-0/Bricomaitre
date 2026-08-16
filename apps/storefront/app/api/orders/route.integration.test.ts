import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

describe('POST /api/orders', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('requires an idempotency key before forwarding an order', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/orders', { method: 'POST', body: '{}' }),
    );
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('forwards the exact body and retry identity to the canonical storefront API', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('{"ok":true}', { status: 201, headers: { 'x-request-id': 'request-42' } }),
    );
    const body = JSON.stringify({ phoneNumber1: '0550000000' });
    const response = await POST(
      new NextRequest('http://localhost/api/orders', {
        method: 'POST',
        body,
        headers: { 'idempotency-key': 'attempt-42', 'content-type': 'application/json' },
      }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get('x-request-id')).toBe('request-42');
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/storefront/orders',
      expect.objectContaining({
        method: 'POST',
        body,
        cache: 'no-store',
        headers: expect.objectContaining({ 'idempotency-key': 'attempt-42' }),
      }),
    );
  });

  it('returns a controlled recoverable response when the order service is down', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('connection refused'));
    const response = await POST(
      new NextRequest('http://localhost/api/orders', {
        method: 'POST',
        body: '{}',
        headers: { 'idempotency-key': 'attempt-42' },
      }),
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'order_service_unavailable' });
  });
});
