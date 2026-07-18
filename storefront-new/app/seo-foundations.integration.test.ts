import { describe, expect, it } from 'vitest';

import { generateMetadata as collectionMetadata } from './[locale]/collections/[slug]/page';
import { generateMetadata as landingMetadata } from './[locale]/landing/[slug]/page';

describe('optional storefront route foundations', () => {
  it('keeps unfinished collections and unavailable landing pages out of indexing', async () => {
    await expect(collectionMetadata({ params: Promise.resolve({ locale: 'fr', slug: 'tools' }) }))
      .resolves.toMatchObject({ robots: { index: false, follow: false } });
    await expect(landingMetadata({ params: Promise.resolve({ locale: 'ar', slug: 'promo' }) }))
      .resolves.toMatchObject({ robots: { index: false, follow: false } });
  });
});
