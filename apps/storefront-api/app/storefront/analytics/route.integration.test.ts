import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  enforceGlobalRateLimitMock,
  enforceRequestRateLimitMock,
  hasDbMock,
  enqueueLightweightJobMock,
} = vi.hoisted(() => ({
  enforceGlobalRateLimitMock: vi.fn(),
  enforceRequestRateLimitMock: vi.fn(),
  hasDbMock: vi.fn(),
  enqueueLightweightJobMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ hasDb: hasDbMock }));
vi.mock('@bric/runtime/jobs', () => ({ enqueueLightweightJob: enqueueLightweightJobMock }));
vi.mock('../../../lib/request-security', () => ({
  buildRateLimitHeaders: () => ({}),
  enforceGlobalRateLimit: enforceGlobalRateLimitMock,
  enforceRequestRateLimit: enforceRequestRateLimitMock,
}));
vi.mock('../../../lib/meta-request', () => ({
  hasTrustedStorefrontProxySecret: () => true,
}));

import { POST } from './route';

function request(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('https://api.bricomaitre.com/storefront/analytics', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /storefront/analytics', () => {
  beforeEach(() => {
    hasDbMock.mockReset().mockReturnValue(true);
    enqueueLightweightJobMock.mockReset().mockResolvedValue({ kind: 'created' });
    enforceGlobalRateLimitMock.mockReset().mockResolvedValue({
      ok: true,
      limit: 1_200,
      remaining: 1_199,
      resetAt: Date.now() + 60_000,
      retryAfterSeconds: 0,
    });
    enforceRequestRateLimitMock.mockReset().mockResolvedValue({
      ok: true,
      limit: 60,
      remaining: 59,
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
    expect(enqueueLightweightJobMock).not.toHaveBeenCalled();
  });

  it('returns a controlled 400 for a contract-invalid event', async () => {
    const response = await POST(request(JSON.stringify({ eventName: 'page_view' })));

    expect(response.status).toBe(400);
    expect(enqueueLightweightJobMock).not.toHaveBeenCalled();
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
    expect(enqueueLightweightJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queueName: 'storefront-analytics',
        jobName: 'analytics-event',
        dedupeKey: 'event-1',
        data: {
          event: expect.objectContaining({ occurredAt: '2026-08-16T10:00:00.000Z' }),
        },
      }),
    );
  });

  it('clamps arbitrarily old client time before it can poison permanent rollups', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T10:00:00.000Z'));

    const response = await POST(
      request(
        JSON.stringify({
          eventVersion: 1,
          eventId: 'event-old',
          journeyId: 'journey-old',
          sessionId: 'session-old',
          eventName: 'page_view',
          occurredAt: '2019-12-20T00:00:00.000Z',
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(enqueueLightweightJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          event: expect.objectContaining({ occurredAt: '2026-08-16T10:00:00.000Z' }),
        },
      }),
    );
  });

  it('reports an event that is already awaiting ingestion as deduplicated', async () => {
    enqueueLightweightJobMock.mockResolvedValue({ kind: 'existing' });

    const response = await POST(
      request(
        JSON.stringify({
          eventVersion: 1,
          eventId: 'event-existing',
          journeyId: 'journey-existing',
          sessionId: 'session-existing',
          eventName: 'page_view',
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, queued: true, deduped: true });
  });

  it('accepts but does not persist recognizable browser automation', async () => {
    const response = await POST(
      request(
        JSON.stringify({
          eventVersion: 1,
          eventId: 'event-synthetic',
          journeyId: 'journey-synthetic',
          sessionId: 'session-synthetic',
          eventName: 'page_view',
        }),
        { 'user-agent': 'Mozilla/5.0 HeadlessChrome Playwright' },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      queued: false,
      filtered: 'automation',
    });
    expect(enqueueLightweightJobMock).not.toHaveBeenCalled();
  });
});
