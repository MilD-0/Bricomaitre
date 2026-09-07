import { vi } from 'vitest';
import type { ProductCategorizationClassifier, ProductContentGenerator } from '@bric/ai-core';

// Replace external boundaries, never tool implementations or database services.
vi.mock('next/cache', () => ({
  revalidateTag() {},
  revalidatePath() {},
  cacheTag() {},
  cacheLife() {},
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock('../lib/search-console/transport', async (original) => ({
  ...(await original<typeof import('../lib/search-console/transport')>()),
  accessToken: async () => 'local-simulator-token',
}));
vi.mock('@bric/ai-core', async (original) => ({
  ...(await original<typeof import('@bric/ai-core')>()),
  createProductContentGenerator: (): ProductContentGenerator => ({
    async generate(input) {
      return {
        changes: Object.fromEntries(
          input.fields.map((field) => [
            field,
            field.endsWith('Ar')
              ? `أداة للعمل في الورشة ${input.product.id}`
              : `${input.product.title} pour l’atelier`,
          ]),
        ),
        reasoning: 'Controlled generation-provider response for persistence evaluation.',
        usage: {},
        model: 'local-generation-simulator',
      };
    },
  }),
  createProductCategorizationClassifier: (): ProductCategorizationClassifier => ({
    async classify(input) {
      return {
        decision: {
          categoryId: input.categories[0].id,
          confidence: 0.9,
          ambiguous: false,
          reasoning: 'Controlled provider response, not a categorization-quality evaluation.',
        },
        usage: {},
        model: 'local-generation-simulator',
      };
    },
  }),
}));
vi.mock('../lib/ai-landing-page', async (original) => {
  const actual = await original<typeof import('../lib/ai-landing-page')>();
  return {
    ...actual,
    createLandingPageGenerator: () => ({
      async generate(input: { product: { title: string } }) {
        return {
          document: {
            schemaVersion: 2,
            theme: { accent: 'orange', density: 'comfortable', shell: 'campaign' },
            seo: {
              title: input.product.title.slice(0, 70),
              description: 'Un outil pour votre atelier.',
              indexable: false,
            },
            blocks: [
              {
                id: 'hero',
                type: 'product-hero',
                variant: 'media-left',
                heading: input.product.title,
                subheading: 'Pour les travaux de votre atelier.',
                imageUrl: null,
                imageAlt: '',
                primaryCtaLabel: 'Commander',
                showAddToCart: true,
              },
              {
                id: 'final',
                type: 'final-cta',
                heading: 'Commandez votre outil',
                primaryCtaLabel: 'Commander',
              },
            ],
          },
          reasoning: 'Controlled generation-provider response.',
          groundingNotes: [],
          usage: {},
          model: 'local-generation-simulator',
          stages: {
            status: 'completed',
            plannedSections: 0,
            generatedSections: 0,
            fallbackSections: 0,
            skippedSections: 0,
            retryCount: 0,
            failures: [],
          },
        };
      },
    }),
    // Use the real edit validator, scope enforcement and document assembly.
    createLandingPageEditor: () =>
      actual.createLandingPageEditor(undefined, {
        async generatePlan(input) {
          return {
            usage: {},
            plan: {
              theme: input.currentDocument.theme,
              seo: input.currentDocument.seo,
              blocks: input.currentDocument.blocks.map((block) =>
                input.targetBlockIds.includes(block.id)
                  ? {
                      mode: 'generate' as const,
                      blockId: block.id,
                      type: block.type,
                      purpose: input.instruction,
                      surface: 'plain' as const,
                      width: 'wide' as const,
                    }
                  : { mode: 'preserve' as const, blockId: block.id },
              ),
              reasoning: 'Controlled edit-provider response.',
              groundingNotes: [],
            },
          };
        },
        async generateBlock({ existingBlock, editInput }) {
          if (!existingBlock || !('heading' in existingBlock))
            throw new Error('Expected an existing heading block');
          return {
            usage: {},
            block: {
              ...existingBlock,
              heading:
                editInput.locale === 'ar'
                  ? 'أداة عملية لورشتك'
                  : 'Un outil pratique pour votre atelier',
            },
          };
        },
      }),
  };
});
vi.mock('../lib/export-artifacts', async (original) => {
  const actual = await original<typeof import('../lib/export-artifacts')>();
  const { writeFile } = await import('node:fs/promises');
  const { join, basename } = await import('node:path');
  return {
    ...actual,
    async uploadPrivateExportArtifact(input: { fileName: string; body: Buffer }) {
      const name = basename(input.fileName);
      await writeFile(join(process.env.ADMIN_AI_EVAL_DIRECTORY!, name), input.body, {
        mode: 0o600,
      });
      return { key: `local-eval/${name}`, expiresAt: new Date(Date.now() + 86400000) };
    },
  };
});

export function installMatrixNetworkGuard() {
  const original = globalThis.fetch;
  const provider = new URL(process.env.ADMIN_AI_EVAL_PROVIDER_ORIGIN!).origin;
  const modelOrigins = new Set(
    Object.entries(process.env)
      .filter(
        ([key, value]) => /^(AI_|OPENROUTER|EXPERIENTIAL)/.test(key) && value?.startsWith('http'),
      )
      .map(([, value]) => new URL(value!).origin),
  );
  modelOrigins.add('https://openrouter.ai');
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === '/api/internal/revalidate') return Response.json({ revalidated: true });
    if (url.origin !== provider && !modelOrigins.has(url.origin)) {
      throw new Error(`Matrix blocked external network destination: ${url.origin}`);
    }
    return original(input, { ...init, redirect: 'error' });
  };
  return () => {
    globalThis.fetch = original;
  };
}
