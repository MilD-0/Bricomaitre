vi.mock('next/cache', () => ({ unstable_cache: (load: (...args: unknown[]) => unknown) => load }));

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
}));

describe('app/storefront/settings/route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns an unavailable response without a database', async () => {
    mocks.hasDb.mockReturnValue(false);

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Storefront database is unavailable.',
    });
  });

  it('normalizes the stored contact number and preserves cleared optional contacts', async () => {
    mocks.hasDb.mockReturnValue(true);
    mocks.limit.mockResolvedValue([
      {
        contactPhone: '+213 555 12 34 56',
        phoneEnabled: true,
        aiAssistantEnabled: false,
        contactEmail: null,
        address: null,
        mapUrl: null,
        facebookUrl: null,
      },
    ]);

    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      phoneDisplay: '0555 12 34 56',
      phoneHref: 'tel:+213555123456',
      phoneEnabled: true,
      aiAssistantEnabled: false,
      contactEmail: null,
      address: null,
      mapUrl: null,
      facebookUrl: null,
      aiModel: 'openai/gpt-5.6-luna',
      aiFallbackModel: null,
    });
  });

  it('uses business defaults when no settings record exists', async () => {
    mocks.hasDb.mockReturnValue(true);
    mocks.limit.mockResolvedValue([]);
    const response = await GET();
    await expect(response.json()).resolves.toMatchObject({
      contactEmail: 'bricomaitre@gmail.com',
      address: 'BT N20, Cité 08 Mai 45, Bab Ezzouar 16024, Alger',
      mapUrl: 'https://maps.app.goo.gl/MpAM58nHS2G5JBah8',
      facebookUrl: 'https://www.facebook.com/profile.php?id=61562272954715',
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
