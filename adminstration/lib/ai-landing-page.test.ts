import { describe, expect, it } from 'vitest';

import { generateLandingPageDraft, LANDING_PAGE_GENERATION_INSTRUCTIONS, normalizeGeneratedLandingPage, type LandingPageGenerationInput } from './ai-landing-page';

const verifiedImage = 'https://d3.example.com/product.jpg';

function generatedDocument() {
  return {
    schemaVersion: 1 as const,
    theme: { accent: 'graphite' as const, density: 'spacious' as const, shell: 'campaign' as const },
    seo: { title: 'Clé à cliquet sans fil', description: 'Une page produit fondée sur les informations du catalogue.', indexable: true },
    blocks: [
      { id: 'hero', type: 'product-hero' as const, variant: 'media-right' as const, heading: 'Travaillez plus simplement', subheading: 'Clé à cliquet sans fil.', imageUrl: verifiedImage, imageAlt: 'Clé à cliquet', primaryCtaLabel: 'Commander maintenant', showAddToCart: true },
      { id: 'benefits', type: 'benefit-grid' as const, variant: 'numbered' as const, heading: 'Les points essentiels', items: [
        { title: 'Commande simple', description: 'Une commande confirmée par téléphone.', icon: 'phone' as const },
        { title: 'Paiement à la livraison', description: 'Payez à la réception.', icon: 'payment' as const },
      ] },
      { id: 'feature', type: 'media-feature' as const, variant: 'media-left' as const, heading: 'Pensée pour vos travaux', body: 'Retrouvez les informations utiles du produit.', imageUrl: 'https://invented.example.com/image.jpg', imageAlt: 'Produit', bullets: [] },
      { id: 'final', type: 'final-cta' as const, variant: 'split' as const, heading: 'Prêt à commander ?', body: 'Livraison rapide partout en Algérie.', primaryCtaLabel: 'Commander', imageUrl: verifiedImage, imageAlt: 'Clé à cliquet' },
    ],
  };
}

describe('AI landing-page output guardrails', () => {
  it('teaches the model the full expanded composition vocabulary and evidence boundaries', () => {
    for (const blockType of ['editorial-intro', 'image-gallery', 'use-cases', 'comparison', 'process', 'trust-band', 'commerce-panel']) {
      expect(LANDING_PAGE_GENERATION_INSTRUCTIONS).toContain(blockType);
    }
    expect(LANDING_PAGE_GENERATION_INSTRUCTIONS).toContain('section surface and width controls');
    expect(LANDING_PAGE_GENERATION_INSTRUCTIONS).toContain('both sides are explicitly supported');
  });
  it('keeps a varied valid composition while forcing review-only SEO', () => {
    const document = normalizeGeneratedLandingPage(generatedDocument(), [verifiedImage]);

    expect(document.theme).toEqual({ accent: 'graphite', density: 'spacious', shell: 'campaign' });
    expect(document.blocks.map((block) => block.type)).toEqual(['product-hero', 'benefit-grid', 'media-feature', 'final-cta']);
    expect(document.seo.indexable).toBe(false);
  });

  it('keeps verified catalog assets and removes invented image URLs', () => {
    const document = normalizeGeneratedLandingPage(generatedDocument(), [verifiedImage]);
    const imageUrls = document.blocks.flatMap((block) => 'imageUrl' in block ? [block.imageUrl] : []);

    expect(imageUrls).toEqual([verifiedImage, null, verifiedImage]);
  });

  it('guards nested gallery assets and upgrades generated drafts to vocabulary version two', () => {
    const raw = generatedDocument();
    raw.blocks.splice(2, 0, {
      id: 'gallery', type: 'image-gallery', variant: 'mosaic', heading: 'Voir le produit',
      images: [{ imageUrl: verifiedImage, imageAlt: 'Produit', caption: 'Vue principale' }, { imageUrl: 'https://invented.example.com/gallery.jpg', imageAlt: 'Produit', caption: 'Vue secondaire' }],
    } as never);

    const document = normalizeGeneratedLandingPage(raw, [verifiedImage]);
    const gallery = document.blocks.find((block) => block.type === 'image-gallery');
    expect(document.schemaVersion).toBe(2);
    expect(gallery).toMatchObject({ images: [{ imageUrl: verifiedImage }, { imageUrl: null }] });
  });

  it('rejects structurally unsafe output instead of partially accepting it', () => {
    const document = generatedDocument();
    document.blocks = document.blocks.filter((block) => block.type !== 'final-cta');

    expect(() => normalizeGeneratedLandingPage(document, [verifiedImage])).toThrow();
  });

  it('falls back to the catalog-derived document when generation fails', async () => {
    const fallback = normalizeGeneratedLandingPage(generatedDocument(), [verifiedImage]);
    const generationInput: LandingPageGenerationInput = {
      locale: 'fr',
      campaignAngle: 'Pour les mécaniciens mobiles',
      product: { id: 1, title: 'Clé à cliquet', titleAr: null, description: 'Une clé sans fil.', descriptionAr: null, brand: 'HONESTPRO', category: 'Clés', sku: 'HP-1', barcode: null, images: [verifiedImage] },
    };

    const result = await generateLandingPageDraft({
      generator: { generate: async () => { throw new Error('provider timeout'); } },
      generationInput,
      fallbackDocument: fallback,
    });

    expect(result.document).toEqual(fallback);
    expect(result.model).toBe('deterministic-v1');
    expect(result.reasoning).toContain('safe catalog-grounded fallback');
  });

  it('reapplies asset and indexing guardrails to injected generator results', async () => {
    const generated = generatedDocument();
    const result = await generateLandingPageDraft({
      generator: {
        generate: async () => ({ document: generated, reasoning: 'Product-specific composition.', groundingNotes: [], usage: {}, model: 'content-model' }),
      },
      generationInput: {
        locale: 'fr', product: { id: 1, title: 'Clé', titleAr: null, description: null, descriptionAr: null, brand: null, category: null, sku: null, barcode: null, images: [verifiedImage] },
      },
      fallbackDocument: normalizeGeneratedLandingPage(generatedDocument(), [verifiedImage]),
    });

    expect(result.model).toBe('content-model');
    expect(result.document.seo.indexable).toBe(false);
    expect(result.document.blocks.find((block) => block.id === 'feature')).toMatchObject({ imageUrl: null });
  });
});
