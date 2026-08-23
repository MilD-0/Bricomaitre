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
      const tools = Object.entries(scenario.expectations.exactToolCounts ?? {}).flatMap(
        ([name, count]) => Array.from({ length: count }, () => ({ name })),
      );
      for (const name of scenario.expectations.requiredTools ?? []) {
        if (!tools.some((tool) => tool.name === name)) tools.push({ name });
      }
      expect(
        evaluateAiTranscript(scenario, {
          status: 'completed',
          answer:
            'Voici le résultat opérationnel demandé, fondé sur les données actuelles de l’application.',
          toolCalls: tools,
        }).passed,
        scenario.id,
      ).toBe(true);
    }
  });
});
