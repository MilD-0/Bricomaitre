import { evaluateAiTranscript } from '@bric/ai-core/evals';
import { describe, expect, it } from 'vitest';

import { ADMIN_AI_EVAL_SCENARIOS } from './ai-eval-scenarios';

describe('admin AI commercialization eval scenarios', () => {
  it('covers every first-class administration domain with stable unique IDs', () => {
    expect(new Set(ADMIN_AI_EVAL_SCENARIOS.map((scenario) => scenario.id)).size).toBe(
      ADMIN_AI_EVAL_SCENARIOS.length,
    );
    expect(new Set(ADMIN_AI_EVAL_SCENARIOS.map((scenario) => scenario.input.surface))).toEqual(
      new Set([
        'orders',
        'orders/ecotrack',
        'inventory',
        'assets',
        'assets/landingPages',
        'ai_proposals',
        'administration',
        'administration/history',
        'administration/users',
        'administration/storefront',
        'bulletin',
        'analytics',
        'stats/acquisition',
        'stats/assumptions',
        'stats/search',
        'products',
        'products/archive',
        'brands_categories',
      ]),
    );
  });

  it('can grade a perfect tool trajectory for every scenario', () => {
    for (const scenario of ADMIN_AI_EVAL_SCENARIOS) {
      const tools: Array<{ name: string; input?: unknown }> = Object.entries(
        scenario.expectations.exactToolCounts ?? {},
      ).flatMap(([name, count]) =>
        Array.from({ length: count }, () => ({ name }) as { name: string; input?: unknown }),
      );
      for (const name of scenario.expectations.requiredTools ?? []) {
        if (!tools.some((tool) => tool.name === name)) tools.push({ name });
      }
      for (const [name, input] of Object.entries(scenario.expectations.requiredToolInputs ?? {})) {
        const tool = tools.find((candidate) => candidate.name === name);
        if (tool) tool.input = input;
        else tools.push({ name, input });
      }
      expect(
        evaluateAiTranscript(scenario, {
          status: 'completed',
          answer: [
            scenario.locale === 'ar'
              ? 'هذه هي النتيجة التشغيلية المطلوبة بناءً على بيانات التطبيق الحالية.'
              : 'Voici le résultat opérationnel demandé, fondé sur les données actuelles de l’application.',
            ...(scenario.expectations.requiredTerms ?? []),
            ...(scenario.expectations.requiredAnyTerms ?? []).map(([term]) => term),
            ...(scenario.expectations.requiredConcepts ?? []).flatMap((concepts) =>
              concepts.map(([term]) => term),
            ),
          ].join(' '),
          toolCalls: tools,
        }).passed,
        scenario.id,
      ).toBe(true);
    }
  });

  it('requires exact persisted landing-page inputs and rejects proposal language', () => {
    const create = ADMIN_AI_EVAL_SCENARIOS.find(
      (scenario) => scenario.id === 'admin-landing-page-create',
    )!;
    const edit = ADMIN_AI_EVAL_SCENARIOS.find(
      (scenario) => scenario.id === 'admin-landing-page-edit',
    )!;
    const createFromProduct = ADMIN_AI_EVAL_SCENARIOS.find(
      (scenario) => scenario.id === 'admin-landing-page-create-from-product-workspace',
    )!;
    const editFromProduct = ADMIN_AI_EVAL_SCENARIOS.find(
      (scenario) => scenario.id === 'admin-landing-page-edit-from-product-workspace',
    )!;

    expect(create.expectations.requiredToolInputs).toEqual({
      create_landing_page: { productId: 12, locale: 'fr', active: false },
    });
    expect(edit.expectations.requiredToolInputs).toEqual({
      edit_landing_page: { landingPageId: 41, expectedRevision: 3 },
    });
    expect(create.expectations.forbiddenTerms).toContain('proposition');
    expect(edit.expectations.passThreshold).toBe(1);
    expect(createFromProduct.input.surface).toBe('products');
    expect(createFromProduct.expectations.requiredTools).toEqual([
      'find_products',
      'create_landing_page',
    ]);
    expect(editFromProduct.input.surface).toBe('products');
    expect(editFromProduct.expectations.requiredTools).toEqual([
      'inspect_landing_pages',
      'edit_landing_page',
    ]);
  });

  it('gates conversational background exports and expired-proposal cleanup', () => {
    const exportStart = ADMIN_AI_EVAL_SCENARIOS.find(
      (scenario) => scenario.id === 'admin-background-product-export-start',
    )!;
    const expiredCleanup = ADMIN_AI_EVAL_SCENARIOS.find(
      (scenario) => scenario.id === 'admin-proposal-expired-cleanup',
    )!;

    expect(exportStart.expectations.requiredToolInputs).toEqual({
      start_background_job: { type: 'product_export' },
    });
    expect(exportStart.expectations.forbiddenTerms).toContain('déjà terminé');
    expect(expiredCleanup.expectations.requiredTools).toEqual([
      'inspect_ai_proposals',
      'delete_expired_ai_proposals',
    ]);
    expect(expiredCleanup.expectations.forbiddenTools).toEqual(['review_ai_proposals']);
  });
});
