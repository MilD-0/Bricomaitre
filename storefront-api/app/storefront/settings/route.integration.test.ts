import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const mocks = vi.hoisted(() => ({
  applyServerCache: vi.fn(),
  hasDb: vi.fn(),
  limit: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  hasDb: mocks.hasDb,
  getDb: () => ({
    select: () => ({
      from: () => ({ limit: mocks.limit }),
    }),
  }),
}));

vi.mock('@bric/storefront-core/server-cache', () => ({
  CACHE_TAGS: { storefrontSettings: 'storefront-settings' },
  applyServerCache: mocks.applyServerCache,
}));

describe('app/storefront/settings/route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the safe default contact settings without a database', async () => {
    mocks.hasDb.mockReturnValue(false);

    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      phoneDisplay: '0795 34 28 26',
      phoneHref: 'tel:+213795342826',
      phoneEnabled: true,
      aiAssistantEnabled: true,
    });
  });

  it('normalizes and returns the stored contact number', async () => {
    mocks.hasDb.mockReturnValue(true);
    mocks.limit.mockResolvedValue([{
      contactPhone: '+213 555 12 34 56',
      phoneEnabled: true,
      aiAssistantEnabled: false,
    }]);

    const response = await GET();

    expect(mocks.applyServerCache).toHaveBeenCalledWith(
      { stale: 300, revalidate: 3600, expire: 86400 },
      'storefront-settings',
    );
    await expect(response.json()).resolves.toEqual({
      phoneDisplay: '0555 12 34 56',
      phoneHref: 'tel:+213555123456',
      phoneEnabled: true,
      aiAssistantEnabled: false,
    });
  });

  it('keeps phone support enabled for rows carrying the retired toggle value', async () => {
    mocks.hasDb.mockReturnValue(true);
    mocks.limit.mockResolvedValue([{
      contactPhone: '0795342826',
      phoneEnabled: false,
      aiAssistantEnabled: true,
    }]);

    const response = await GET();

    await expect(response.json()).resolves.toMatchObject({
      phoneDisplay: '0795 34 28 26',
      phoneEnabled: true,
    });
  });
});
