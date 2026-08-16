import { describe, expect, it } from 'vitest';

import { buildDefaultLandingPageDocument, landingPageSlugFromProduct } from './landing-pages';

describe('admin landing-page defaults', () => {
  it('creates a complete six-block French campaign without inventing price or stock', () => {
    const document = buildDefaultLandingPageDocument({
      locale: 'fr',
      title: 'Perceuse WADFOW',
      description: 'Une perceuse compacte.',
      imageUrl: 'https://cdn.example.com/drill.jpg',
    });
    expect(document.blocks.map((block) => block.type)).toEqual([
      'product-hero',
      'benefit-grid',
      'media-feature',
      'specifications',
      'faq',
      'final-cta',
    ]);
    expect(JSON.stringify(document)).not.toMatch(/prix|stock|promotion|dernières pièces/i);
    expect(document.seo.indexable).toBe(false);
  });

  it('uses Arabic conversion copy for an Arabic-only revision', () => {
    const document = buildDefaultLandingPageDocument({ locale: 'ar', title: 'مثقاب لاسلكي' });
    expect(document.blocks[0]).toMatchObject({
      type: 'product-hero',
      primaryCtaLabel: 'اطلب الآن',
    });
  });

  it('adds the landing-page id to the selected product slug', () => {
    expect(landingPageSlugFromProduct({ slug: 'perceuse-sans-fil' })).toBe('perceuse-sans-fil');
    expect(landingPageSlugFromProduct({ slug: 'perceuse-sans-fil' }, 42)).toBe(
      'perceuse-sans-fil-42',
    );
    expect(() => landingPageSlugFromProduct({ slug: '../campaign' })).toThrow();
  });

  it('keeps numbered landing slugs inside the public URL contract', () => {
    const longSlug = 'a'.repeat(160);
    expect(landingPageSlugFromProduct({ slug: longSlug }, 987654321)).toMatch(/-987654321$/);
    expect(landingPageSlugFromProduct({ slug: longSlug }, 987654321)).toHaveLength(160);
  });
});
