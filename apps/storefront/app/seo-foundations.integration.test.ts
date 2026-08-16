import { describe, expect, it } from 'vitest';

import { generateMetadata as landingMetadata } from './[locale]/landing/[slug]/page';

describe('optional storefront routes', () => {
  it('keeps unavailable landing pages out of indexing', async () => {
    await expect(
      landingMetadata({ params: Promise.resolve({ locale: 'ar', slug: 'promo' }) }),
    ).resolves.toMatchObject({ robots: { index: false, follow: false } });
  });
});
