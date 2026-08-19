import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const mocks = vi.hoisted(() => ({
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
  createServerCache: ({ load }: { load: (...args: unknown[]) => unknown }) => load,
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
      contactEmail: 'bricomaitre@gmail.com',
      address: 'BT N20, Cité 08 Mai 45, Bab Ezzouar 16024, Alger',
      mapUrl: 'https://maps.app.goo.gl/MpAM58nHS2G5JBah8',
      facebookUrl: 'https://www.facebook.com/profile.php?id=61562272954715',
      aiModel: 'gpt-5-mini',
      aiFallbackModel: null,
    });
  });

  it('normalizes and returns the stored contact number', async () => {
    mocks.hasDb.mockReturnValue(true);
    mocks.limit.mockResolvedValue([
      {
        contactPhone: '+213 555 12 34 56',
        phoneEnabled: true,
        aiAssistantEnabled: false,
      },
    ]);

    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      phoneDisplay: '0555 12 34 56',
      phoneHref: 'tel:+213555123456',
      phoneEnabled: true,
      aiAssistantEnabled: false,
      contactEmail: 'bricomaitre@gmail.com',
      address: 'BT N20, Cité 08 Mai 45, Bab Ezzouar 16024, Alger',
      mapUrl: 'https://maps.app.goo.gl/MpAM58nHS2G5JBah8',
      facebookUrl: 'https://www.facebook.com/profile.php?id=61562272954715',
      aiModel: 'gpt-5-mini',
      aiFallbackModel: null,
    });
  });

  it('keeps phone support enabled for rows carrying the retired toggle value', async () => {
    mocks.hasDb.mockReturnValue(true);
    mocks.limit.mockResolvedValue([
      {
        contactPhone: '0795342826',
        phoneEnabled: false,
        aiAssistantEnabled: true,
      },
    ]);

    const response = await GET();

    await expect(response.json()).resolves.toMatchObject({
      phoneDisplay: '0795 34 28 26',
      phoneEnabled: true,
    });
  });
});
