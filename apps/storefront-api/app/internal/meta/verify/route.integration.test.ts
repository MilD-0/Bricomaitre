import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMetaEventMock } = vi.hoisted(() => ({
  sendMetaEventMock: vi.fn(),
}));

vi.mock('@bric/storefront-core/meta', () => ({
  sendMetaEvent: sendMetaEventMock,
}));

import { POST } from './route';

describe('POST /internal/meta/verify', () => {
  beforeEach(() => {
    process.env.STOREFRONT_API_DEPLOY_TOKEN = 'deploy-token';
    process.env.META_TEST_EVENT_CODE = 'TEST123';
    sendMetaEventMock.mockReset();
  });

  it('requires the deploy token', async () => {
    const response = await POST(
      new NextRequest('http://localhost/internal/meta/verify', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).toBe(401);
  });

  it('rejects malformed JSON without sending a provider event', async () => {
    const response = await POST(
      new NextRequest('http://localhost/internal/meta/verify', {
        method: 'POST',
        headers: { authorization: 'Bearer deploy-token', 'content-type': 'application/json' },
        body: '{',
      }),
    );
    expect(response.status).toBe(400);
    expect(sendMetaEventMock).not.toHaveBeenCalled();
  });

  it('requires an accepted Meta event', async () => {
    sendMetaEventMock.mockResolvedValue({
      ok: false,
      status: 200,
      message: 'Meta returned events_received < 1.',
      fbtraceId: 'trace-none',
    });
    const response = await POST(
      new NextRequest('http://localhost/internal/meta/verify', {
        method: 'POST',
        headers: {
          authorization: 'Bearer deploy-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          eventId: 'verify-1',
          eventSourceUrl: 'https://bricomaitre.com/?verify=1',
        }),
      }),
    );
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'Meta returned events_received < 1.',
    });
  });

  it('returns only redacted acceptance metadata', async () => {
    sendMetaEventMock.mockResolvedValue({
      ok: true,
      status: 200,
      eventsReceived: 1,
      fbtraceId: 'trace-ok',
    });
    const response = await POST(
      new NextRequest('http://localhost/internal/meta/verify', {
        method: 'POST',
        headers: {
          authorization: 'Bearer deploy-token',
          'content-type': 'application/json',
          'x-real-ip': '203.0.113.20',
        },
        body: JSON.stringify({
          eventId: 'verify-2',
          eventSourceUrl: 'https://bricomaitre.com/?verify=1',
        }),
      }),
    );
    await expect(response.json()).resolves.toEqual({
      ok: true,
      eventsReceived: 1,
      fbtraceId: 'trace-ok',
    });
    expect(sendMetaEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userData: {
          client_ip_address: '203.0.113.20',
          client_user_agent: 'BricMetaDeployVerification/2.0',
        },
        customData: {},
      }),
      { testEventCode: 'TEST123' },
    );
  });
});
