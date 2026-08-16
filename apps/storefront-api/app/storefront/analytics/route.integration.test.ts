import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { enforceRequestRateLimitMock, hasDbMock, startOwnedJobMock } = vi.hoisted(() => ({
  enforceRequestRateLimitMock: vi.fn(),
  hasDbMock: vi.fn(),
  startOwnedJobMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ hasDb: hasDbMock }));
vi.mock('@bric/runtime/jobs', () => ({ startOwnedJob: startOwnedJobMock }));
vi.mock('../../../lib/request-security', () => ({
  buildRateLimitHeaders: () => ({}),
  enforceRequestRateLimit: enforceRequestRateLimitMock,
}));

import { POST } from './route';

function request(body: string) {
  return new NextRequest('https://api.bricomaitre.com/storefront/analytics', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

describe('POST /storefront/analytics', () => {
  beforeEach(() => {
    hasDbMock.mockReset().mockReturnValue(true);
    startOwnedJobMock.mockReset().mockResolvedValue({ kind: 'created' });
    enforceRequestRateLimitMock.mockReset().mockResolvedValue({
      ok: true,
      limit: 120,
      remaining: 119,
      resetAt: Date.now() + 60_000,
      retryAfterSeconds: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a controlled 400 for malformed JSON', async () => {
    const response = await POST(request('{'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid JSON request body.' });
    expect(startOwnedJobMock).not.toHaveBeenCalled();
  });

  it('returns a controlled 400 for a contract-invalid event', async () => {
    const response = await POST(request(JSON.stringify({ eventName: 'page_view' })));

    expect(response.status).toBe(400);
    expect(startOwnedJobMock).not.toHaveBeenCalled();
  });

  it('queues a governed event with future client time clamped at the API boundary', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T10:00:00.000Z'));

    const response = await POST(
      request(
        JSON.stringify({
          eventVersion: 1,
          eventId: 'event-1',
          journeyId: 'journey-1',
          sessionId: 'session-1',
          eventName: 'page_view',
          occurredAt: '2026-08-25T01:21:04.286Z',
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, queued: true, deduped: false });
    expect(startOwnedJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queueName: 'storefront-analytics',
        kind: 'analytics-event',
        ownerKey: 'event-1',
        data: {
          event: expect.objectContaining({ occurredAt: '2026-08-16T10:00:00.000Z' }),
        },
      }),
    );
  });
});
