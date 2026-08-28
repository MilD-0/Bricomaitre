import { describe, expect, it } from 'vitest';

import {
  buildLandingPagePreviewPayload,
  landingPageDocumentSchema,
  landingPagePreviewSchema,
} from './landing-pages';

const validDocument = {
  schemaVersion: 1,
  theme: { accent: 'orange', density: 'comfortable', shell: 'campaign' },
  seo: {
    title: 'Perceuse WADFOW 20V',
    description: 'Une page complète pour la perceuse WADFOW 20V.',
    indexable: false,
  },
  blocks: [
    {
      id: 'hero',
      type: 'product-hero',
      variant: 'media-left',
      heading: 'Travaillez sans câble',
      subheading: 'Puissante et maniable.',
      imageUrl: null,
      imageAlt: '',
      primaryCtaLabel: 'Commander',
      showAddToCart: true,
    },
    {
      id: 'final',
      type: 'final-cta',
      variant: 'solid',
      heading: 'Prêt à travailler ?',
      body: '',
      primaryCtaLabel: 'Commander maintenant',
      imageUrl: null,
      imageAlt: '',
    },
  ],
};

describe('landing page document contract', () => {
  it('accepts a bounded conversion page with required hero and final CTA', () => {
    expect(landingPageDocumentSchema.parse(validDocument).blocks).toHaveLength(2);
  });

  it('rejects arbitrary block types and duplicate block identities', () => {
    expect(
      landingPageDocumentSchema.safeParse({
        ...validDocument,
        blocks: [...validDocument.blocks, validDocument.blocks[0]],
      }).success,
    ).toBe(false);
    expect(
      landingPageDocumentSchema.safeParse({
        ...validDocument,
        blocks: [{ id: 'code', type: 'custom-code', source: '<script />' }],
      }).success,
    ).toBe(false);
  });

  it('requires both the above-fold product hero and a closing purchase CTA', () => {
    expect(
      landingPageDocumentSchema.safeParse({
        ...validDocument,
        blocks: validDocument.blocks.slice(0, 1),
      }).success,
    ).toBe(false);
  });

  it('accepts the expanded version-two composition vocabulary with section treatments', () => {
    const document = landingPageDocumentSchema.parse({
      ...validDocument,
      schemaVersion: 2,
      blocks: [
        { ...validDocument.blocks[0], surface: 'dark', width: 'full', variant: 'product-stage' },
        {
          id: 'story',
          type: 'editorial-intro',
          surface: 'soft',
          width: 'narrow',
          variant: 'statement',
          eyebrow: 'Le bon geste',
          heading: 'Moins d’effort, plus de maîtrise',
          body: 'Une introduction fondée sur le produit.',
          highlights: ['Simple', 'Direct'],
        },
        {
          id: 'gallery',
          type: 'image-gallery',
          variant: 'mosaic',
          heading: 'Voyez chaque détail',
          images: [
            { imageUrl: null, imageAlt: '', caption: 'Face avant' },
            { imageUrl: null, imageAlt: '', caption: 'Accessoires' },
          ],
        },
        {
          id: 'uses',
          type: 'use-cases',
          variant: 'editorial',
          heading: 'Pour vos travaux',
          body: '',
          items: [
            { title: 'Atelier', description: 'Usage décrit dans le catalogue.', icon: 'tool' },
            { title: 'Entretien', description: 'Usage décrit dans le catalogue.', icon: 'target' },
          ],
        },
        {
          id: 'compare',
          type: 'comparison',
          variant: 'spotlight',
          heading: 'Comparez clairement',
          productLabel: 'Ce produit',
          alternativeLabel: 'Alternative',
          items: [
            { label: 'Commande', productValue: 'Simple', alternativeValue: 'Variable' },
            { label: 'Paiement', productValue: 'À la livraison', alternativeValue: 'Variable' },
          ],
          footnote: 'Comparaison à vérifier.',
        },
        {
          id: 'steps',
          type: 'process',
          variant: 'timeline',
          heading: 'Comment commander',
          body: '',
          steps: [
            { title: 'Choisissez', description: 'Sélectionnez la quantité.' },
            { title: 'Confirmez', description: 'Nous vous appelons.' },
          ],
        },
        {
          id: 'trust',
          type: 'trust-band',
          variant: 'ribbon',
          heading: '',
          items: [
            { title: 'Paiement à la livraison', description: '', icon: 'payment' },
            { title: 'Partout en Algérie', description: '', icon: 'delivery' },
          ],
        },
        {
          id: 'offer',
          type: 'commerce-panel',
          variant: 'image-led',
          heading: 'Passez à l’action',
          body: 'Prix et disponibilité restent dynamiques.',
          bullets: [],
          imageUrl: null,
          imageAlt: '',
          primaryCtaLabel: 'Commander',
          showAddToCart: true,
        },
        validDocument.blocks[1],
      ],
    });

    expect(document.schemaVersion).toBe(2);
    expect(document.blocks.map((block) => block.type)).toContain('commerce-panel');
    expect(document.blocks[1]).toMatchObject({ surface: 'soft', width: 'narrow' });
  });
});

describe('landing page preview contract', () => {
  it('accepts only bounded signed preview query values', () => {
    expect(
      landingPagePreviewSchema.parse({
        revision: '4',
        timestamp: '1787817600000',
        signature: 'a'.repeat(64),
      }),
    ).toEqual({ revision: 4, timestamp: '1787817600000', signature: 'a'.repeat(64) });

    expect(
      landingPagePreviewSchema.safeParse({
        revision: '0',
        timestamp: 'yesterday',
        signature: 'not-a-signature',
      }).success,
    ).toBe(false);
  });

  it('builds one canonical payload for admin signing and API verification', () => {
    expect(
      buildLandingPagePreviewPayload({ locale: 'fr', slug: 'perceuse-20v', revision: 4 }),
    ).toBe('landing-page-preview-v1:fr:perceuse-20v:4');
  });
});
