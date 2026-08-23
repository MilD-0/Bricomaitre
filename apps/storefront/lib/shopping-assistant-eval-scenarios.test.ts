import { evaluateAiTranscript } from '@bric/ai-core/evals';
import { describe, expect, it } from 'vitest';

import { SHOPPING_ASSISTANT_EVAL_SCENARIOS } from './shopping-assistant-eval-scenarios';

describe('shopping assistant commercialization eval scenarios', () => {
  it('covers French and Arabic across catalog, product, cart, and checkout context', () => {
    expect(new Set(SHOPPING_ASSISTANT_EVAL_SCENARIOS.map((scenario) => scenario.id)).size).toBe(
      SHOPPING_ASSISTANT_EVAL_SCENARIOS.length,
    );
    expect(new Set(SHOPPING_ASSISTANT_EVAL_SCENARIOS.map((scenario) => scenario.locale))).toEqual(
      new Set(['fr', 'ar']),
    );
    expect(
      new Set(SHOPPING_ASSISTANT_EVAL_SCENARIOS.map((scenario) => scenario.input.context)),
    ).toEqual(new Set(['catalog', 'product', 'cart', 'checkout']));
  });

  it('can grade a perfect trajectory for every scenario', () => {
    for (const scenario of SHOPPING_ASSISTANT_EVAL_SCENARIOS) {
      const answer =
        scenario.locale === 'ar'
          ? 'هذه نتيجة مفصلة مبنية على بيانات الكتالوج الحالية والمنتجات المتاحة الآن.'
          : 'Voici une réponse détaillée fondée sur les données actuelles du catalogue.';
      expect(
        evaluateAiTranscript(scenario, {
          status: 'completed',
          answer,
          toolCalls: (scenario.expectations.requiredTools ?? []).map((name) => ({ name })),
        }).passed,
        scenario.id,
      ).toBe(true);
    }
  });
});
