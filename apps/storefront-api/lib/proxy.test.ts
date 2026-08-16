import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { proxy } from '../proxy';

describe('storefront API request proxy', () => {
  it('rejects forged Next Action traffic with a controlled client error', async () => {
    const response = proxy(
      new NextRequest('https://api.bricomaitre.com/storefront/products', {
        headers: { 'Next-Action': 'unknown-action-id' },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Unsupported request protocol' });
  });

  it('allows ordinary API traffic to continue', () => {
    expect(proxy(new NextRequest('https://api.bricomaitre.com/api/health')).status).toBe(200);
  });
});
