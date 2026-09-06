import { describe, expect, it } from 'vitest';

import { estimateAdminAiModelCost, getAiUsagePricing } from './stats-experience-ai';
import { resolveRawWebsiteFilters } from './stats-experience-shared';

describe('experience stats raw-event window', () => {
  it('uses the latest seven reporting days for an open all-time range', () => {
    expect(
      resolveRawWebsiteFilters(
        { startDate: '', endDate: '' },
        new Date('2026-08-24T23:30:00.000Z'),
      ),
    ).toEqual({ startDate: '2026-08-19', endDate: '' });
  });

  it('does not widen an explicitly narrower range', () => {
    expect(
      resolveRawWebsiteFilters(
        { startDate: '2026-08-22', endDate: '2026-08-24' },
        new Date('2026-08-24T12:00:00.000Z'),
      ),
    ).toEqual({ startDate: '2026-08-22', endDate: '2026-08-24' });
  });
});

describe('experience stats AI pricing', () => {
  it('keeps estimated cost unavailable until both verified rates are configured', () => {
    expect(getAiUsagePricing('admin', {})).toBeNull();
    expect(
      getAiUsagePricing('admin', {
        AI_ADMIN_INPUT_COST_PER_1M_USD: '1.25',
      }),
    ).toBeNull();
    expect(
      getAiUsagePricing('storefront', {
        AI_STOREFRONT_INPUT_COST_PER_1M_USD: '',
        AI_STOREFRONT_OUTPUT_COST_PER_1M_USD: '',
      }),
    ).toBeNull();
  });

  it('accepts explicit non-negative per-million-token rates', () => {
    expect(
      getAiUsagePricing('storefront', {
        AI_STOREFRONT_INPUT_COST_PER_1M_USD: '0.15',
        AI_STOREFRONT_OUTPUT_COST_PER_1M_USD: '0.60',
      }),
    ).toEqual({ input: 0.15, output: 0.6 });
    expect(
      getAiUsagePricing('admin', {
        AI_ADMIN_INPUT_COST_PER_1M_USD: '-1',
        AI_ADMIN_OUTPUT_COST_PER_1M_USD: '2',
      }),
    ).toBeNull();
  });

  it('uses the selected model and provider rate for admin assistant cost estimates', () => {
    expect(
      estimateAdminAiModelCost(
        [
          {
            name: 'deepseek/deepseek-v4-flash',
            runs: 1,
            tokens: 1_000_000,
            inputTokens: 800_000,
            outputTokens: 200_000,
          },
          {
            name: 'deepseek/deepseek-v4-flash@baidu/fp8',
            runs: 1,
            tokens: 1_000_000,
            inputTokens: 500_000,
            outputTokens: 500_000,
          },
          {
            name: 'openai/gpt-5.6-luna',
            runs: 1,
            tokens: 1_000_000,
            inputTokens: 250_000,
            outputTokens: 750_000,
          },
        ],
        3,
        null,
      ),
    ).toEqual({
      estimatedCostUsd: 5.00545,
      costCoverageRate: 100,
    });
  });
});
