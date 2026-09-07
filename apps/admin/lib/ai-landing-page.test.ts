import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createLandingPageGenerator,
  createLandingPageEditor,
  generateLandingPageDraft,
  normalizeGeneratedLandingPage,
  type LandingPageGenerationInput,
  type LandingPageEditStageRunner,
  type LandingPageStageRunner,
} from './ai-landing-page';

const verifiedImage = 'https://d3.example.com/product.jpg';

const testConfig = {
  enabled: true,
  provider: 'openrouter' as const,
  apiKey: 'test-key',
  contentModel: 'test/content-model',
  maxRetries: 0,
};

const generationInput: LandingPageGenerationInput = {
  locale: 'fr',
  campaignAngle: 'Pour les mécaniciens mobiles',
  product: {
    id: 1,
    title: 'Clé à cliquet',
    titleAr: null,
    description: 'Une clé sans fil.',
    descriptionAr: null,
    brand: 'HONESTPRO',
    category: 'Clés',
    sku: 'HP-1',
    barcode: null,
    images: [verifiedImage],
  },
};

function stagedRunner(options?: {
  failPlanOnce?: boolean;
  failSecondBlock?: boolean;
  failSecondBlockOnce?: boolean;
}): LandingPageStageRunner {
  let planCalls = 0;
  let secondBlockCalls = 0;
  return {
    generatePlan: async () => {
      planCalls += 1;
      if (options?.failPlanOnce && planCalls === 1) throw new Error('provider timeout');
      return {
        plan: {
          theme: { accent: 'graphite', density: 'spacious' },
          seo: {
            title: 'Clé à cliquet sans fil',
            description: 'Découvrez la clé à cliquet HONESTPRO pour vos travaux.',
          },
          hero: {
            variant: 'media-right',
            heading: 'Travaillez plus simplement',
            subheading: 'Une clé sans fil.',
            primaryCtaLabel: 'Commander',
          },
          sections: [
            {
              type: 'editorial-intro',
              purpose: 'Présenter le produit',
              surface: 'plain',
              width: 'narrow',
            },
            {
              type: 'trust-band',
              purpose: 'Expliquer la commande',
              surface: 'soft',
              width: 'wide',
            },
          ],
          finalCta: {
            variant: 'split',
            heading: 'Prêt à commander ?',
            body: 'Paiement à la livraison.',
            primaryCtaLabel: 'Commander maintenant',
          },
          reasoning: 'A concise product story followed by verified ordering reassurance.',
          groundingNotes: ['Copy uses the catalog title and description.'],
        },
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      };
    },
    generateBlock: async ({ section, index }) => {
      if (index === 1) secondBlockCalls += 1;
      if (
        index === 1 &&
        (options?.failSecondBlock || (options?.failSecondBlockOnce && secondBlockCalls === 1))
      )
        throw new Error('malformed section');
      if (section.type === 'editorial-intro')
        return {
          block: {
            id: 'intro',
            type: 'editorial-intro',
            surface: section.surface,
            width: section.width,
            variant: 'statement',
            eyebrow: 'HONESTPRO',
            heading: 'Un outil présenté simplement',
            body: 'Une clé sans fil pour vos travaux.',
            highlights: [],
          },
          usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
        };
      return {
        block: {
          id: 'trust',
          type: 'trust-band',
          surface: section.surface,
          width: section.width,
          variant: 'ribbon',
          heading: 'Commandez sereinement',
          items: [
            {
              title: 'Paiement à la livraison',
              description: 'Payez à la réception.',
              icon: 'payment',
            },
            {
              title: 'Confirmation téléphonique',
              description: 'Bricomaitre confirme votre commande.',
              icon: 'phone',
            },
          ],
        },
        usage: { inputTokens: 5, outputTokens: 6, totalTokens: 11 },
      };
    },
  };
}

function generatedDocument() {
  return {
    schemaVersion: 1 as const,
    theme: {
      accent: 'graphite' as const,
      density: 'spacious' as const,
      shell: 'campaign' as const,
    },
    seo: {
      title: 'Clé à cliquet sans fil',
      description: 'Une page produit fondée sur les informations du catalogue.',
      indexable: true,
    },
    blocks: [
      {
        id: 'hero',
        type: 'product-hero' as const,
        variant: 'media-right' as const,
        heading: 'Travaillez plus simplement',
        subheading: 'Clé à cliquet sans fil.',
        imageUrl: verifiedImage,
        imageAlt: 'Clé à cliquet',
        primaryCtaLabel: 'Commander maintenant',
        showAddToCart: true,
      },
      {
        id: 'benefits',
        type: 'benefit-grid' as const,
        variant: 'numbered' as const,
        heading: 'Les points essentiels',
        items: [
          {
            title: 'Commande simple',
            description: 'Une commande confirmée par téléphone.',
            icon: 'phone' as const,
          },
          {
            title: 'Paiement à la livraison',
            description: 'Payez à la réception.',
            icon: 'payment' as const,
          },
        ],
      },
      {
        id: 'feature',
        type: 'media-feature' as const,
        variant: 'media-left' as const,
        heading: 'Pensée pour vos travaux',
        body: 'Retrouvez les informations utiles du produit.',
        imageUrl: 'https://invented.example.com/image.jpg',
        imageAlt: 'Produit',
        bullets: [],
      },
      {
        id: 'final',
        type: 'final-cta' as const,
        variant: 'split' as const,
        heading: 'Prêt à commander ?',
        body: 'Livraison rapide partout en Algérie.',
        primaryCtaLabel: 'Commander',
        imageUrl: verifiedImage,
        imageAlt: 'Clé à cliquet',
      },
    ],
  };
}

function editRunner(options?: {
  unknownBlock?: boolean;
  failGeneratedBlock?: boolean;
  failGeneratedBlockOnce?: boolean;
  omitUnmentionedBlocks?: boolean;
  deleteBenefits?: boolean;
}): LandingPageEditStageRunner {
  let generatedBlockCalls = 0;
  return {
    generatePlan: async (input) => ({
      plan: {
        theme: input.currentDocument.theme,
        seo: {
          title: 'Clé à cliquet — campagne mobile',
          description: input.currentDocument.seo.description,
        },
        blocks: [
          {
            mode: 'generate' as const,
            blockId: options?.unknownBlock ? 'missing-hero' : 'hero',
            type: 'product-hero' as const,
            purpose: 'Rewrite the hero for mobile mechanics.',
            surface: 'dark' as const,
            width: 'full' as const,
          },
          { mode: 'preserve' as const, blockId: 'benefits' },
          { mode: 'preserve' as const, blockId: 'feature' },
          { mode: 'preserve' as const, blockId: 'final' },
        ].filter((slot) =>
          options?.omitUnmentionedBlocks
            ? slot.blockId === 'hero' || slot.blockId === 'final'
            : options?.deleteBenefits
              ? slot.blockId !== 'benefits'
              : true,
        ),
        reasoning: 'Only the hero needs to change for the supplied brief.',
        groundingNotes: ['The revised hero uses the verified product title.'],
      },
      usage: { inputTokens: 11, outputTokens: 12, totalTokens: 23 },
    }),
    generateBlock: async ({ slot }) => {
      generatedBlockCalls += 1;
      if (
        options?.failGeneratedBlock ||
        (options?.failGeneratedBlockOnce && generatedBlockCalls === 1)
      )
        throw new Error('invalid generated hero');
      return {
        block: {
          id: slot.blockId!,
          type: 'product-hero',
          variant: 'product-stage',
          surface: slot.surface,
          width: slot.width,
          heading: 'La clé des mécaniciens mobiles',
          subheading: 'Une clé sans fil.',
          imageUrl: verifiedImage,
          imageAlt: 'Clé à cliquet',
          primaryCtaLabel: 'Commander',
          showAddToCart: true,
        },
        usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
      };
    },
  };
}

describe('AI landing-page output guardrails', () => {
  it('keeps a varied valid composition while forcing review-only SEO', () => {
    const document = normalizeGeneratedLandingPage(generatedDocument(), [verifiedImage]);

    expect(document.theme).toEqual({ accent: 'graphite', density: 'spacious', shell: 'campaign' });
    expect(document.blocks.map((block) => block.type)).toEqual([
      'product-hero',
      'benefit-grid',
      'media-feature',
      'final-cta',
    ]);
    expect(document.seo.indexable).toBe(false);
  });

  it('keeps verified catalog assets and removes invented image URLs', () => {
    const document = normalizeGeneratedLandingPage(generatedDocument(), [verifiedImage]);
    const imageUrls = document.blocks.flatMap((block) =>
      'imageUrl' in block ? [block.imageUrl] : [],
    );

    expect(imageUrls).toEqual([verifiedImage, null, verifiedImage]);
  });

  it('guards nested gallery assets and upgrades generated drafts to vocabulary version two', () => {
    const raw = generatedDocument();
    raw.blocks.splice(2, 0, {
      id: 'gallery',
      type: 'image-gallery',
      variant: 'mosaic',
      heading: 'Voir le produit',
      images: [
        { imageUrl: verifiedImage, imageAlt: 'Produit', caption: 'Vue principale' },
        {
          imageUrl: 'https://invented.example.com/gallery.jpg',
          imageAlt: 'Produit',
          caption: 'Vue secondaire',
        },
      ],
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

  it('edits only planned blocks while preserving exact IDs, content, and ordering elsewhere', async () => {
    const currentDocument = normalizeGeneratedLandingPage(generatedDocument(), [verifiedImage]);
    const result = await createLandingPageEditor(testConfig, editRunner()).edit({
      ...generationInput,
      instruction: 'Réécris uniquement le hero pour les mécaniciens mobiles.',
      currentDocument,
    });

    expect(result.document.blocks.map((block) => block.id)).toEqual([
      'hero',
      'benefits',
      'feature',
      'final',
    ]);
    expect(result.document.blocks[0]).toMatchObject({
      type: 'product-hero',
      heading: 'La clé des mécaniciens mobiles',
      surface: 'dark',
      width: 'full',
    });
    expect(result.document.blocks.slice(1)).toEqual(currentDocument.blocks.slice(1));
    expect(result.stages).toMatchObject({
      status: 'completed',
      generatedSections: 1,
      preservedSections: 3,
      fallbackSections: 0,
      skippedSections: 0,
      retryCount: 0,
    });
  });

  it('preserves an existing block and reports it when one edit stage fails', async () => {
    const currentDocument = normalizeGeneratedLandingPage(generatedDocument(), [verifiedImage]);
    const result = await createLandingPageEditor(
      testConfig,
      editRunner({ failGeneratedBlock: true }),
    ).edit({
      ...generationInput,
      instruction: 'Réécris le hero.',
      currentDocument,
    });

    expect(result.document.blocks).toEqual(currentDocument.blocks);
    expect(result.stages).toMatchObject({
      status: 'partial-fallback',
      fallbackSections: 1,
      failures: [{ blockId: 'hero', type: 'product-hero', action: 'preserved-existing' }],
      retryCount: 1,
    });
  });

  it('restores model-omitted blocks unless the operator explicitly requested deletion', async () => {
    const currentDocument = normalizeGeneratedLandingPage(generatedDocument(), [verifiedImage]);
    const result = await createLandingPageEditor(
      testConfig,
      editRunner({ omitUnmentionedBlocks: true }),
    ).edit({
      ...generationInput,
      instruction: 'Réécris uniquement le hero.',
      currentDocument,
    });

    expect(result.document.blocks.map((block) => block.id)).toEqual([
      'hero',
      'benefits',
      'feature',
      'final',
    ]);
    expect(result.document.blocks.slice(1)).toEqual(currentDocument.blocks.slice(1));
    expect(result.stages).toMatchObject({ preservedSections: 3, deletedSections: 0 });
  });

  it('deletes only exact block IDs supplied by the outer assistant scope', async () => {
    const currentDocument = normalizeGeneratedLandingPage(generatedDocument(), [verifiedImage]);
    const result = await createLandingPageEditor(
      testConfig,
      editRunner({ deleteBenefits: true }),
    ).edit({
      ...generationInput,
      instruction: 'Supprime la section benefits et préserve le reste.',
      deleteBlockIds: ['benefits'],
      currentDocument,
    });

    expect(result.document.blocks.map((block) => block.id)).toEqual(['hero', 'feature', 'final']);
    expect(result.stages).toMatchObject({ preservedSections: 2, deletedSections: 1 });
  });

  it('does not infer deletion from words in the edit instruction', async () => {
    const currentDocument = normalizeGeneratedLandingPage(generatedDocument(), [verifiedImage]);
    const result = await createLandingPageEditor(
      testConfig,
      editRunner({ deleteBenefits: true }),
    ).edit({
      ...generationInput,
      instruction: 'Supprime benefits, mais aucun identifiant de suppression n’a été fourni.',
      currentDocument,
    });

    expect(result.document.blocks.map((block) => block.id)).toContain('benefits');
    expect(result.stages.deletedSections).toBe(0);
  });

  it('rejects semantically invalid edit plans before generating any block', async () => {
    const currentDocument = normalizeGeneratedLandingPage(generatedDocument(), [verifiedImage]);
    await expect(
      createLandingPageEditor(testConfig, editRunner({ unknownBlock: true })).edit({
        ...generationInput,
        instruction: 'Réécris le hero.',
        currentDocument,
      }),
    ).rejects.toThrow('unknown block "missing-hero"');
  });

  it('surfaces generation failure without persisting a generic replacement page', async () => {
    await expect(
      generateLandingPageDraft({
        generator: {
          generate: async () => {
            throw new Error('provider timeout');
          },
        },
        generationInput,
      }),
    ).rejects.toThrow('provider timeout');
  });

  it('assembles several backend stages into one complete generation result', async () => {
    const result = await createLandingPageGenerator(testConfig, stagedRunner()).generate(
      generationInput,
    );

    expect(result.document.blocks.map((block) => block.type)).toEqual([
      'product-hero',
      'editorial-intro',
      'trust-band',
      'final-cta',
    ]);
    expect(result.document.seo.indexable).toBe(false);
    expect(result.stages).toEqual({
      status: 'completed',
      plannedSections: 2,
      generatedSections: 2,
      fallbackSections: 0,
      skippedSections: 0,
      retryCount: 0,
      failures: [],
    });
    expect(result.usage).toEqual({ inputTokens: 18, outputTokens: 30, totalTokens: 48 });
    expect(result.model).toBe('test/content-model');
  });

  it('keeps successful sections and reports a failed section without inventing replacement copy', async () => {
    const result = await createLandingPageGenerator(
      testConfig,
      stagedRunner({ failSecondBlock: true }),
    ).generate(generationInput);

    expect(result.document.blocks.map((block) => block.type)).toEqual([
      'product-hero',
      'editorial-intro',
      'final-cta',
    ]);
    expect(result.stages).toEqual({
      status: 'partial-fallback',
      plannedSections: 2,
      generatedSections: 1,
      fallbackSections: 0,
      skippedSections: 1,
      retryCount: 1,
      failures: [
        {
          stage: 'block',
          type: 'trust-band',
          reason: 'invalid-structured-output',
        },
      ],
    });
    expect(result.groundingNotes.at(-1)).toContain('1 of 2 planned middle section');
  });

  it('recovers transient plan and block failures before falling back', async () => {
    const result = await createLandingPageGenerator(
      testConfig,
      stagedRunner({ failPlanOnce: true, failSecondBlockOnce: true }),
    ).generate(generationInput);

    expect(result.stages).toMatchObject({
      status: 'completed',
      generatedSections: 2,
      retryCount: 2,
      failures: [],
    });
  });

  it('recovers a transient targeted-edit block failure without changing preserved sections', async () => {
    const currentDocument = normalizeGeneratedLandingPage(generatedDocument(), [verifiedImage]);
    const result = await createLandingPageEditor(
      testConfig,
      editRunner({ failGeneratedBlockOnce: true }),
    ).edit({
      ...generationInput,
      instruction: 'Réécris uniquement le hero.',
      currentDocument,
    });

    expect(result.stages).toMatchObject({
      status: 'completed',
      generatedSections: 1,
      preservedSections: 3,
      retryCount: 1,
      failures: [],
    });
    expect(result.document.blocks.slice(1)).toEqual(currentDocument.blocks.slice(1));
  });

  it('reapplies asset and indexing guardrails to injected generator results', async () => {
    const result = await generateLandingPageDraft({
      generator: {
        generate: async () => ({
          document: generatedDocument() as never,
          reasoning: 'Product-specific composition.',
          groundingNotes: [],
          usage: {},
          model: 'content-model',
        }),
      },
      generationInput: {
        locale: 'fr',
        product: {
          id: 1,
          title: 'Clé',
          titleAr: null,
          description: null,
          descriptionAr: null,
          brand: null,
          category: null,
          sku: null,
          barcode: null,
          images: [verifiedImage],
        },
      },
    });

    expect(result.model).toBe('content-model');
    expect(result.document.seo.indexable).toBe(false);
    expect(result.document.blocks.find((block) => block.id === 'feature')).toMatchObject({
      imageUrl: null,
    });
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('landing-page provider deadlines', () => {
  it.each([
    ['generation', 'plan'],
    ['generation', 'block'],
    ['edit', 'plan'],
    ['edit', 'block'],
  ] as const)('bounds a stalled %s %s stage and retains successful work', async (mode, stage) => {
    const currentDocument = normalizeGeneratedLandingPage(generatedDocument(), [verifiedImage]);
    const editInput = {
      ...generationInput,
      instruction: 'Réécris le hero.',
      currentDocument,
      targetBlockIds: [],
      deleteBlockIds: [],
      allowStructuralChanges: false,
    };
    const plan =
      mode === 'generation'
        ? (await stagedRunner().generatePlan(generationInput)).plan
        : (await editRunner().generatePlan(editInput)).plan;
    const signals: AbortSignal[] = [];
    const localFetch = vi.fn((_url: unknown, init: RequestInit) => {
      if (stage === 'block' && localFetch.mock.calls.length === 1) {
        return Promise.resolve(
          Response.json({
            id: 'plan',
            object: 'chat.completion',
            created: 1,
            model: 'test/content-model',
            choices: [
              {
                index: 0,
                finish_reason: 'stop',
                message: { role: 'assistant', content: JSON.stringify(plan) },
              },
            ],
          }),
        );
      }
      const signal = init.signal!;
      signals.push(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    });
    vi.stubGlobal('fetch', localFetch);
    const config = { ...testConfig, landingPageRequestTimeoutMs: 1000 };
    const result =
      mode === 'generation'
        ? createLandingPageGenerator(config).generate(generationInput)
        : createLandingPageEditor(config).edit(editInput);
    if (stage === 'plan') await expect(result).rejects.toThrow();
    else {
      const completed = await result;
      expect(completed.stages).toMatchObject({ status: 'partial-fallback' });
      expect(completed.document.blocks).toEqual(
        mode === 'edit'
          ? currentDocument.blocks
          : expect.arrayContaining([
              expect.objectContaining({ type: 'product-hero' }),
              expect.objectContaining({ type: 'final-cta' }),
            ]),
      );
    }
    expect(signals.length).toBe(mode === 'generation' && stage === 'block' ? 4 : 2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});
