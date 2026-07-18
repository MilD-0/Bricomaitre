import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const { applyRateLimitMock } = vi.hoisted(() => ({ applyRateLimitMock: vi.fn() }));
vi.mock('@bric/runtime/rate-limit', () => ({ applyRateLimit: applyRateLimitMock }));

import { enforceStorefrontAiRateLimit, getStorefrontAiClientKey, storefrontAiRateLimitHeaders } from './storefront-ai-rate-limit';

describe('storefront shopping AI rate limits', () => {
  it('uses the first forwarded client address and a narrow public limit', async () => {
    applyRateLimitMock.mockResolvedValue({ ok: true });
    await enforceStorefrontAiRateLimit(new NextRequest('https://example.com/api/ai/chat', { headers: { 'x-forwarded-for': '198.51.100.1, 10.0.0.1' } }));
    expect(applyRateLimitMock).toHaveBeenCalledWith({ scope: 'storefront-shopping-ai', key: '198.51.100.1', limit: 12, windowSeconds: 60 });
  });

  it('formats standard retry headers', () => {
    expect(storefrontAiRateLimitHeaders({ ok: false, limit: 12, remaining: 0, resetAt: 1_700_000_000_000, retryAfterSeconds: 10 })).toMatchObject({ 'retry-after': '10', 'x-ratelimit-limit': '12' });
    expect(getStorefrontAiClientKey(new NextRequest('https://example.com'))).toBe('unknown');
  });
});
