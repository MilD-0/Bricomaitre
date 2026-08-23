import { describe, expect, it, vi } from 'vitest';

import { evaluateAiTranscript, runAiEvalSuite, type AiEvalScenario } from './evals';

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
        { name: 'inspect_products', status: 'completed' },
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
        { name: 'inspect_products' },
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

  it('runs scenarios concurrently and aggregates criterion pass rates', async () => {
    const execute = vi.fn(async () => ({
      status: 'completed' as const,
      answer: 'La différence principale concerne la puissance et le prix de chaque outil.',
      toolCalls: [{ name: 'inspect_products' }, { name: 'present_products' }],
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
});
