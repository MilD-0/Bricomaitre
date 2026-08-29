import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { getStorefrontHealthMock } = vi.hoisted(() => ({
  getStorefrontHealthMock: vi.fn(),
}));

vi.mock('../../../lib/health', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/health')>()),
  getStorefrontHealth: getStorefrontHealthMock,
}));

describe('GET /api/health', () => {
  beforeEach(() => {
    getStorefrontHealthMock.mockReset();
  });

  it('returns the storefront health payload', async () => {
    getStorefrontHealthMock.mockResolvedValue({ ok: true });
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      app: 'storefront',
    });
  });

  it('returns degraded when the canonical Storefront API is unavailable', async () => {
    getStorefrontHealthMock.mockResolvedValue({ ok: false });
    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: 'degraded',
      app: 'storefront',
    });
  });
});
