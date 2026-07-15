import { describe, expect, it } from 'vitest';

import { assetBannerSchema } from './assets';

const banner = { title: 'Workshop', titleAr: 'الورشة', imageUrl: null, imageUrlLandscape: 'https://cdn.example.com/wide.jpg', imageUrlPortrait: 'https://cdn.example.com/portrait.jpg', productId: 12, active: true };

describe('banner asset validation', () => {
  it('requires a dedicated landscape and portrait asset for responsive storefront banners', () => {
    const missingPortrait = assetBannerSchema.safeParse({ ...banner, imageUrlPortrait: null });
    const missingLandscape = assetBannerSchema.safeParse({ ...banner, imageUrlLandscape: null });
    expect(missingPortrait.success).toBe(false);
    expect(missingPortrait.error?.issues[0]?.path).toEqual(['imageUrlPortrait']);
    expect(missingLandscape.success).toBe(false);
    expect(missingLandscape.error?.issues[0]?.path).toEqual(['imageUrlLandscape']);
  });

  it('keeps the landscape asset as the legacy fallback image', () => {
    expect(assetBannerSchema.parse(banner)).toMatchObject({ imageUrl: banner.imageUrlLandscape, imageUrlPortrait: banner.imageUrlPortrait });
  });
});
