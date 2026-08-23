import { describe, expect, it, vi } from 'vitest';

import {
  compactAiEvalSuiteReport,
  evaluateAiTranscript,
  runAiEvalSuite,
  type AiEvalScenario,
} from './evals';

const scenario: AiEvalScenario<{ message: string }> = {
  id: 'storefront-grounded-comparison-fr',
  description: 'Compare two known products in French.',
  surface: 'storefront',
  locale: 'fr',
  input: { message: 'Compare les deux produits.' },
  expectations: {
    requiredTools: ['inspect_products', 'present_products'],
    forbiddenTools: ['propose_product_edit'],
    exactToolCounts: { present_products: 1 },
    requiredToolInputs: {
      inspect_products: { focus: { dimension: 'products' } },
    },
    groundedEntityIds: [12, 18],
    requiredRenderedEntityIds: [12, 18],
    requiredTerms: ['différence'],
  },
};

describe('AI evals', () => {
  it('passes a completed, routed, grounded transcript', () => {
    const result = evaluateAiTranscript(scenario, {
      status: 'completed',
      answer: 'La différence principale concerne la puissance et le prix de chaque outil.',
      toolCalls: [
        {
          name: 'inspect_products',
          status: 'completed',
          input: { focus: { dimension: 'products' }, limit: 20 },
        },
        { name: 'present_products', status: 'completed' },
      ],
      renderedEntityIds: [12, 18],
    });

    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it('hard-fails invented entities and forbidden tools even with a fluent answer', () => {
    const result = evaluateAiTranscript(scenario, {
      status: 'completed',
      answer: 'La différence principale concerne la puissance et le prix de chaque outil.',
      toolCalls: [
        { name: 'inspect_products', input: { focus: { dimension: 'products' }, limit: 20 } },
        { name: 'present_products' },
        { name: 'propose_product_edit' },
      ],
      renderedEntityIds: [12, 99],
    });

    expect(result.passed).toBe(false);
    expect(result.hardFailures).toEqual([
      'Forbidden tool propose_product_edit was called.',
      'Rendered ungrounded entities: 99.',
    ]);
  });

  it('fails when a required tool runs with the wrong semantic input', () => {
    const result = evaluateAiTranscript(scenario, {
      status: 'completed',
      answer: 'Voici les produits demandés avec leurs données actuelles.',
      toolCalls: [
        { name: 'inspect_products', input: { focus: { dimension: 'customers' } } },
        { name: 'present_products' },
      ],
      renderedEntityIds: [12, 18],
    });

    expect(result.passed).toBe(false);
    expect(result.criteria.find((criterion) => criterion.name === 'tools')?.details).toContain(
      'Tool inspect_products did not receive the required input fragment {"focus":{"dimension":"products"}}.',
    );
  });

  it('accepts any declared semantic synonym and reports a missing synonym group', () => {
    const semanticScenario: AiEvalScenario<{ message: string }> = {
      ...scenario,
      expectations: {
        minimumAnswerCharacters: 1,
        requiredAnyTerms: [
          ['indisponible', 'non disponible'],
          ['coût publicitaire nul', 'aucune dépense publicitaire'],
        ],
        passThreshold: 1,
      },
    };

    expect(
      evaluateAiTranscript(semanticScenario, {
        status: 'completed',
        answer: 'Profit × indisponible car aucune dépense publicitaire n’est enregistrée.',
      }).passed,
    ).toBe(true);

    const failed = evaluateAiTranscript(semanticScenario, {
      status: 'completed',
      answer: 'Profit × indisponible.',
    });
    expect(failed.passed).toBe(false);
    expect(failed.criteria.find((criterion) => criterion.name === 'content')?.details).toContain(
      'None of the required alternative terms appeared: coût publicitaire nul | aucune dépense publicitaire.',
    );
  });

  it('grades semantic concepts independently of sentence wording', () => {
    const semanticScenario: AiEvalScenario<{ message: string }> = {
      ...scenario,
      expectations: {
        minimumAnswerCharacters: 1,
        requiredConcepts: [[['vente'], ['finalis', 'termin'], ['pas', 'non']]],
        passThreshold: 1,
      },
    };

    expect(
      evaluateAiTranscript(semanticScenario, {
        status: 'completed',
        answer: 'La demande entrante ne constitue donc pas une vente finalisée.',
      }).passed,
    ).toBe(true);
    expect(
      evaluateAiTranscript(semanticScenario, {
        status: 'completed',
        answer: 'Voici les ventes finalisées.',
      }).passed,
    ).toBe(false);
  });

  it('runs scenarios concurrently and aggregates criterion pass rates', async () => {
    const execute = vi.fn(async () => ({
      status: 'completed' as const,
      answer: 'La différence principale concerne la puissance et le prix de chaque outil.',
      toolCalls: [
        { name: 'inspect_products', input: { focus: { dimension: 'products' } } },
        { name: 'present_products' },
      ],
      renderedEntityIds: [12, 18],
    }));
    const report = await runAiEvalSuite({ scenarios: [scenario, scenario], execute });

    expect(report).toMatchObject({ total: 2, passed: 2, passRate: 1, averageScore: 1 });
    expect(report.criteria.tools).toEqual({ evaluated: 2, passed: 2, passRate: 1 });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('retains execution failure evidence in the completion criterion', async () => {
    const report = await runAiEvalSuite({
      scenarios: [scenario],
      execute: async () => {
        throw new Error('provider timed out after retries');
      },
    });

    expect(report.results[0]).toMatchObject({
      scenarioId: scenario.id,
      passed: false,
    });
    expect(report.results[0].criteria.find((criterion) => criterion.name === 'completion')).toEqual(
      {
        name: 'completion',
        score: 0,
        passed: false,
        details: ['Run ended with failed: provider timed out after retries'],
      },
    );
  });

  it('compacts successful results while retaining complete failure evidence', async () => {
    let execution = 0;
    const report = await runAiEvalSuite({
      scenarios: [scenario, scenario],
      execute: async () => {
        const index = execution++;
        return {
          status: index === 0 ? ('completed' as const) : ('failed' as const),
          answer:
            index === 0
              ? 'La différence principale concerne la puissance et le prix de chaque outil.'
              : 'Échec du fournisseur.',
          toolCalls:
            index === 0
              ? [
                  { name: 'inspect_products', input: { focus: { dimension: 'products' } } },
                  { name: 'present_products' },
                ]
              : [],
          renderedEntityIds: index === 0 ? [12, 18] : [],
        };
      },
    });
    const compact = compactAiEvalSuiteReport(report);

    expect(compact).not.toHaveProperty('results');
    expect(compact.failures).toHaveLength(1);
    expect(compact.failures[0]?.scenarioId).toBe(scenario.id);
    expect(compact.total).toBe(2);
  });
});
