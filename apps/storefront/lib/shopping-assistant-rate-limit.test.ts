import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import {
  getShoppingAssistantClientKey,
  shoppingAssistantRateLimitHeaders,
} from './shopping-assistant-rate-limit';

describe('shopping assistant rate limiting', () => {
  it('prefers the address written by the trusted proxy and emits standard bounded headers', () => {
    const request = new NextRequest('http://localhost/api/ai/chat', {
      headers: { 'x-forwarded-for': '203.0.113.8, 10.0.0.2', 'x-real-ip': '10.0.0.3' },
    });
    expect(getShoppingAssistantClientKey(request)).toBe('10.0.0.3');
    expect(
      shoppingAssistantRateLimitHeaders({
        ok: false,
        limit: 12,
        remaining: 0,
        resetAt: 12_345,
        retryAfterSeconds: 7,
      }),
    ).toEqual({
      'x-ratelimit-limit': '12',
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': '13',
      'retry-after': '7',
    });
  });

  it('uses the last forwarded hop when the trusted real-IP header is unavailable', () => {
    const request = new NextRequest('http://localhost/api/ai/chat', {
      headers: { 'x-forwarded-for': '198.51.100.7, 203.0.113.8' },
    });

    expect(getShoppingAssistantClientKey(request)).toBe('203.0.113.8');
  });

  it('falls back without trusting arbitrary request content', () => {
    expect(getShoppingAssistantClientKey(new NextRequest('http://localhost/api/ai/chat'))).toBe(
      'unknown',
    );
  });
});
