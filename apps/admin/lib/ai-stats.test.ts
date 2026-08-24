import { describe, expect, it } from 'vitest';

import {
  aiRate,
  aiStatsQuerySchema,
  classifyAiWorkload,
  isAssistedInfluenceLevel,
} from './ai-stats';

describe('AI analytics semantics', () => {
  it('separates interactive, deterministic, and batch work', () => {
    expect(classifyAiWorkload('admin_chat', 'openai/gpt-5.6-luna')).toBe('interactive');
    expect(classifyAiWorkload('catalog_entity_edit', 'deterministic-v1')).toBe('deterministic');
    expect(classifyAiWorkload('product_categorization', 'deepseek/deepseek-v4-flash')).toBe(
      'batch',
    );
  });

  it('does not call an assistant open an assisted order', () => {
    expect(isAssistedInfluenceLevel('none')).toBe(false);
    expect(isAssistedInfluenceLevel('opened')).toBe(false);
    expect(isAssistedInfluenceLevel('engaged')).toBe(true);
    expect(isAssistedInfluenceLevel('recommendation_clicked')).toBe(true);
    expect(isAssistedInfluenceLevel('recommended_product_ordered')).toBe(true);
  });

  it('returns unavailable rates instead of a false zero when there is no denominator', () => {
    expect(aiRate(0, 0)).toBeNull();
    expect(aiRate(88, 92)).toBe(95.65);
  });

  it('requires both dates before a custom query can execute', () => {
    expect(
      aiStatsQuerySchema.safeParse({
        surface: 'operations',
        range: 'custom',
        startDate: '2026-08-01',
      }).success,
    ).toBe(false);
    expect(
      aiStatsQuerySchema.safeParse({
        surface: 'shopping',
        range: 'custom',
        startDate: '2026-08-01',
        endDate: '2026-08-19',
      }).success,
    ).toBe(true);
  });
});
