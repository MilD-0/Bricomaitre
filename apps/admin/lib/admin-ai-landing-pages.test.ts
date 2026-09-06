import { landingPageDocumentSchema } from '@bric/storefront-core/landing-pages';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  create: vi.fn(),
  detail: vi.fn(),
  list: vi.fn(),
  save: vi.fn(),
  setActive: vi.fn(),
  revalidate: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ getDb: () => ({ select: mocks.select }) }));
vi.mock('./ai-landing-page-product', () => ({
  generateLandingPageForProduct: mocks.generate,
}));
vi.mock('./landing-pages', () => ({
  createLandingPage: mocks.create,
  getLandingPageDetail: mocks.detail,
  queryLandingPageSummaries: mocks.list,
  saveLandingPage: mocks.save,
  setLandingPageActive: mocks.setActive,
}));
vi.mock('./storefront-revalidate', () => ({
  revalidateStorefrontLandingPages: mocks.revalidate,
}));

import {
  adminAiLandingPageInspectionSchema,
  createAdminAiLandingPage,
  editAdminAiLandingPage,
  inspectAdminAiLandingPages,
  setAdminAiLandingPagePublication,
  type AdminAiLandingPageEditor,
} from './admin-ai-landing-pages';

const document = landingPageDocumentSchema.parse({
  schemaVersion: 2,
  theme: { accent: 'orange', density: 'comfortable', shell: 'campaign' },
  seo: { title: 'Perceuse', description: 'Une perceuse pour vos travaux.', indexable: false },
  blocks: [
    {
      id: 'hero',
      type: 'product-hero',
      heading: 'Perceuse',
      primaryCtaLabel: 'Commander',
    },
    {
      id: 'final',
      type: 'final-cta',
      heading: 'Prêt à commander ?',
      primaryCtaLabel: 'Commander',
    },
  ],
});

function productQuery(product = {}) {
  const row = {
    id: 12,
    title: 'Perceuse',
    titleAr: null,
    description: 'Une perceuse.',
    descriptionAr: null,
    brand: 'Bricomaitre',
    category: 'Perceuses',
    sku: 'DRILL-12',
    barcode: null,
    images: ['https://cdn.example.com/drill.jpg'],
    ...product,
  };
  const query = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue([row]),
  };
  query.from.mockReturnValue(query);
  query.leftJoin.mockReturnValue(query);
  query.where.mockReturnValue(query);
  mocks.select.mockReturnValue(query);
}

describe('admin AI landing-page operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generate.mockResolvedValue({
      product: { id: 12 },
      slug: 'perceuse',
      generation: {
        document,
        model: 'openai/gpt-5.6-luna',
        reasoning: 'A direct product campaign.',
        groundingNotes: ['Catalog title used.'],
        stages: { status: 'completed', generatedSections: 4 },
      },
    });
    mocks.create.mockResolvedValue({ id: 41, slug: 'perceuse-41', document });
    mocks.setActive.mockResolvedValue({ id: 41, active: true, currentRevision: 1 });
    mocks.detail.mockResolvedValue({
      id: 41,
      productId: 12,
      productTitle: 'Perceuse',
      productSlug: 'perceuse',
      locale: 'fr',
      slug: 'perceuse-41',
      active: false,
      currentRevision: 3,
      updatedAt: '2026-08-23T00:00:00.000Z',
      document,
    });
    mocks.list.mockResolvedValue({
      items: [
        {
          id: 41,
          productId: 12,
          productTitle: 'Perceuse',
          productSlug: 'perceuse',
          locale: 'fr',
          slug: 'perceuse-41',
          active: false,
          currentRevision: 3,
          updatedAt: '2026-08-23T00:00:00.000Z',
        },
      ],
      missingIds: [],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNextPage: false },
    });
    mocks.save.mockResolvedValue({ id: 41, active: false, currentRevision: 4, changed: true });
    productQuery();
  });

  it('creates the generated document immediately and publishes only when explicitly requested', async () => {
    await expect(
      createAdminAiLandingPage(
        {
          productId: 12,
          locale: 'fr',
          creativeBrief: 'Une campagne directe pour artisans.',
          active: true,
        },
        { email: 'admin@bricomaitre.com', name: 'Admin' },
      ),
    ).resolves.toMatchObject({
      id: 41,
      slug: 'perceuse-41',
      active: true,
      currentRevision: 1,
      generation: { stages: { status: 'completed' } },
    });
    expect(mocks.create).toHaveBeenCalledWith({
      productId: 12,
      locale: 'fr',
      document,
      actorId: 'admin@bricomaitre.com',
      source: 'ai',
    });
    expect(mocks.setActive).toHaveBeenCalledWith({
      id: 41,
      active: true,
      expectedRevision: 1,
      actorId: 'admin@bricomaitre.com',
    });
    expect(mocks.revalidate).toHaveBeenCalledOnce();
  });

  it('edits the complete inspected revision and returns block-level fallback details', async () => {
    const editor: AdminAiLandingPageEditor = {
      edit: vi.fn().mockResolvedValue({
        document,
        model: 'openai/gpt-5.6-luna',
        reasoning: 'Reworked only the hero.',
        groundingNotes: ['Existing blocks preserved.'],
        usage: {},
        stages: {
          status: 'partial-fallback',
          plannedSections: 2,
          generatedSections: 0,
          preservedSections: 1,
          fallbackSections: 1,
          skippedSections: 0,
          failures: [{ blockId: 'hero', type: 'product-hero', action: 'preserved-existing' }],
        },
      }),
    };

    const result = await editAdminAiLandingPage(
      {
        landingPageId: 41,
        expectedRevision: 3,
        instruction: 'Réécris le hero.',
        targetBlockIds: ['hero'],
      },
      { email: 'admin@bricomaitre.com' },
      editor,
    );

    expect(editor.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        instruction: 'Réécris le hero.',
        targetBlockIds: ['hero'],
        deleteBlockIds: [],
        allowStructuralChanges: false,
        currentDocument: document,
        product: expect.objectContaining({ id: 12, images: ['https://cdn.example.com/drill.jpg'] }),
      }),
    );
    expect(mocks.save).toHaveBeenCalledWith({
      id: 41,
      document,
      active: false,
      expectedRevision: 3,
      actorId: 'admin@bricomaitre.com',
      source: 'ai',
    });
    expect(result.generation?.stages).toMatchObject({
      status: 'partial-fallback',
      failures: [{ blockId: 'hero', action: 'preserved-existing' }],
    });
    expect(mocks.revalidate).toHaveBeenCalledOnce();
  });

  it('changes publication state directly without invoking the content model', async () => {
    await setAdminAiLandingPagePublication(
      {
        landingPageId: 41,
        expectedRevision: 3,
        active: true,
      },
      { email: 'admin@bricomaitre.com' },
    );

    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.setActive).toHaveBeenCalledWith({
      id: 41,
      active: true,
      expectedRevision: 3,
      actorId: 'admin@bricomaitre.com',
    });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('preserves publication when revising an active page so the saved revision stays live', async () => {
    mocks.detail.mockResolvedValueOnce({
      id: 41,
      productId: 12,
      productTitle: 'Perceuse',
      productSlug: 'perceuse',
      locale: 'fr',
      slug: 'perceuse-41',
      active: true,
      currentRevision: 3,
      updatedAt: '2026-08-23T00:00:00.000Z',
      document,
    });
    const editor: AdminAiLandingPageEditor = {
      edit: vi.fn().mockResolvedValue({
        document,
        model: 'openai/gpt-5.6-luna',
        reasoning: 'Hero revised.',
        groundingNotes: [],
        usage: {},
        stages: {
          status: 'completed',
          plannedSections: 2,
          generatedSections: 1,
          preservedSections: 1,
          deletedSections: 0,
          fallbackSections: 0,
          skippedSections: 0,
          retryCount: 0,
          failures: [],
        },
      }),
    };

    await editAdminAiLandingPage(
      { landingPageId: 41, expectedRevision: 3, instruction: 'Rewrite the hero.' },
      undefined,
      editor,
    );

    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ active: true }));
  });

  it('progresses from summaries to block outlines and exact selected content', async () => {
    await expect(inspectAdminAiLandingPages({ query: 'perceuse' })).resolves.toMatchObject({
      view: 'summary',
      pagination: { total: 1 },
      items: [{ id: 41, productId: 12 }],
    });
    expect(mocks.detail).not.toHaveBeenCalled();

    await expect(
      inspectAdminAiLandingPages({ landingPageIds: [41], view: 'outline' }),
    ).resolves.toMatchObject({
      view: 'outline',
      items: [
        {
          id: 41,
          blocks: [
            { id: 'hero', type: 'product-hero', heading: 'Perceuse' },
            { id: 'final', type: 'final-cta' },
          ],
        },
      ],
    });

    const content = await inspectAdminAiLandingPages({
      landingPageIds: [41],
      view: 'content',
      blockIds: ['hero'],
    });
    expect(content.items[0]).toMatchObject({
      availableBlockIds: ['hero', 'final'],
      document: { blocks: [{ id: 'hero' }] },
    });
  });

  it('requires one exact page before returning complete authored content', () => {
    expect(() => adminAiLandingPageInspectionSchema.parse({ view: 'content' })).toThrow(
      'one exact landing-page ID',
    );
  });
});
