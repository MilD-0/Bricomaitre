import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { getMetaRequestContext } from './meta-request';

describe('getMetaRequestContext', () => {
  it('prefers the client address written by the trusted proxy', () => {
    const request = new NextRequest('https://api.bricomaitre.com/storefront/meta/events', {
      headers: {
        'x-forwarded-for': '198.51.100.11, 10.0.0.2',
        'x-real-ip': '203.0.113.12',
      },
    });

    expect(getMetaRequestContext(request).clientIpAddress).toBe('203.0.113.12');
  });

  it('uses the last forwarded hop when x-real-ip is unavailable', () => {
    const request = new NextRequest('https://api.bricomaitre.com/storefront/meta/events', {
      headers: { 'x-forwarded-for': '198.51.100.11, 203.0.113.12' },
    });

    expect(getMetaRequestContext(request).clientIpAddress).toBe('203.0.113.12');
  });
});
