import { evaluateAiTranscript } from '@bric/ai-core/evals';
import { describe, expect, it } from 'vitest';

import { SHOPPING_ASSISTANT_EVAL_SCENARIOS } from './shopping-assistant-eval-scenarios';

describe('shopping assistant commercialization eval scenarios', () => {
  it('covers French and Arabic across discovery, campaign, cart, checkout, and post-purchase context', () => {
    expect(new Set(SHOPPING_ASSISTANT_EVAL_SCENARIOS.map((scenario) => scenario.id)).size).toBe(
      SHOPPING_ASSISTANT_EVAL_SCENARIOS.length,
    );
    expect(new Set(SHOPPING_ASSISTANT_EVAL_SCENARIOS.map((scenario) => scenario.locale))).toEqual(
      new Set(['fr', 'ar']),
    );
    expect(
      new Set(SHOPPING_ASSISTANT_EVAL_SCENARIOS.map((scenario) => scenario.input.context)),
    ).toEqual(new Set(['catalog', 'product', 'landing', 'cart', 'checkout', 'thank-you']));
  });

  it('can grade a perfect trajectory for every scenario', () => {
    for (const scenario of SHOPPING_ASSISTANT_EVAL_SCENARIOS) {
      const answer = `${
        scenario.locale === 'ar'
          ? 'هذه نتيجة مفصلة مبنية على بيانات الكتالوج الحالية والمنتجات المتاحة الآن.'
          : 'Voici une réponse détaillée fondée sur les données actuelles du catalogue.'
      } ${(scenario.expectations.requiredTerms ?? []).join(' ')}`;
      expect(
        evaluateAiTranscript(scenario, {
          status: 'completed',
          answer,
          toolCalls: (scenario.expectations.requiredTools ?? []).map((name) => ({
            name,
            input: scenario.expectations.requiredToolInputs?.[name],
          })),
          renderedEntityIds:
            scenario.expectations.requiredRenderedEntityIds ??
            scenario.expectations.groundedEntityIds?.slice(0, 1),
        }).passed,
        scenario.id,
      ).toBe(true);
    }
  });
});
