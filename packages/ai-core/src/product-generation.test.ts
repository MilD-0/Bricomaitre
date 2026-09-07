import { afterEach, describe, expect, it, vi } from 'vitest';

import { getAiConfig } from './config';
import { createProductCategorizationClassifier } from './product-categorization';
import { createProductContentGenerator } from './product-content';
import {
  createProductRelationGenerator,
  UnsupportedProductRelationError,
} from './product-knowledge';

const config = getAiConfig({
  AI_ENABLED: 'true',
  AI_PROVIDER: 'openrouter',
  OPENROUTER_API_KEY: 'test-key',
  AI_ADMIN_MODEL: 'test-model',
  AI_CONTENT_MODEL: 'test-model',
  AI_CONTENT_REQUEST_TIMEOUT_MS: '1000',
  AI_MAX_RETRIES: '0',
});
const product = {
  id: 1,
  title: 'Cordless drill',
  titleAr: null,
  description: 'Uses Acme 18V batteries.',
  descriptionAr: null,
  category: 'Tools',
  brand: 'Acme',
  sku: null,
  currentCategoryId: null,
  currentCategory: null,
};
const generate = {
  content: () => createProductContentGenerator(config).generate({ product, fields: ['titleAr'] }),
  categorization: () =>
    createProductCategorizationClassifier(config).classify({
      product,
      categories: [{ id: 12, name: 'Drills', nameAr: null, parentId: null, parentName: null }],
    }),
  relation: () =>
    createProductRelationGenerator(config).generate({
      sourceProduct: product,
      targetProduct: { ...product, id: 2, title: 'Acme 18V battery' },
    }),
};

function respondWith(output: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        id: 'chat-test',
        object: 'chat.completion',
        created: 1,
        model: 'test-model',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: JSON.stringify(output),
            },
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
      }),
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('product generation through the provider boundary', () => {
  it.each(Object.entries(generate))(
    'aborts a stalled %s request at the configured deadline',
    async (_, run) => {
      let signal: AbortSignal | null | undefined;
      vi.stubGlobal(
        'fetch',
        vi.fn((_url, init: RequestInit) => {
          signal = init.signal;
          return new Promise<Response>((_resolve, reject) => {
            signal!.addEventListener('abort', () => reject(signal!.reason), { once: true });
          });
        }),
      );
      await expect(run()).rejects.toThrow();
      expect(signal?.aborted).toBe(true);
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it('returns requested localized content and the measured usage', async () => {
    respondWith({
      changes: { titleAr: 'مثقاب لاسلكي' },
      reasoning: 'Translated the supplied title.',
    });
    await expect(generate.content()).resolves.toMatchObject({
      changes: { titleAr: 'مثقاب لاسلكي' },
      model: 'test-model',
      usage: { inputTokens: 20, outputTokens: 5, totalTokens: 25 },
    });
  });

  it('turns an out-of-taxonomy classification into an ambiguous decision', async () => {
    respondWith({
      categoryId: 99,
      ambiguous: false,
      confidence: 0.9,
      reasoning: 'Drill category.',
    });
    await expect(generate.categorization()).resolves.toMatchObject({
      decision: { categoryId: null, ambiguous: true, confidence: 0 },
    });
  });

  it('refuses an unsupported relationship instead of returning a reviewable proposal', async () => {
    respondWith({
      relationType: 'requires',
      confidence: 0.2,
      evidenceSummary: 'Insufficient evidence.',
      reasoning: 'No compatibility specification.',
    });
    await expect(generate.relation()).rejects.toBeInstanceOf(UnsupportedProductRelationError);
  });

  it('keeps a supported generated relationship proposed and preserves its evidence', async () => {
    respondWith({
      relationType: 'requires',
      confidence: 0.8,
      evidenceSummary: 'Drill specifies Acme 18V batteries.',
      reasoning: 'The supplied battery matches the specification.',
    });
    await expect(generate.relation()).resolves.toMatchObject({
      proposal: {
        sourceProductId: 1,
        targetProductId: 2,
        reviewStatus: 'proposed',
        source: 'ai',
        confidence: 0.8,
        evidenceSummary: 'Drill specifies Acme 18V batteries.',
      },
    });
  });
});
