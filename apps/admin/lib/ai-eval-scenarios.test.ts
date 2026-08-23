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
        'inventory',
        'assets',
        'assets/landingPages',
        'ai_proposals',
        'administration',
        'administration/storefront',
        'bulletin',
        'analytics',
        'products',
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
});
