import { describe, expect, it } from 'vitest';

import {
  adminAiApplicationDate,
  adminAiChatRequestSchema,
  adminAiConversationTitle,
  adminAiGuidanceRequestSchema,
  adminAiGuidanceRequestSchemaForTopics,
  adminAiRuntimeInstructions,
  readAdminAiGuidance,
  readAdminAiGuidanceForTopics,
} from './admin-ai-runtime';

describe('model-led Admin assistant runtime', () => {
  it('validates the existing client contract without deriving semantics from the message', () => {
    const parsed = adminAiChatRequestSchema.parse({
      message: 'What does adjusted profit mean this month?',
      conversationKey: '8f572d91-3ed6-4ad5-b2a5-e1928a2c3c82',
      model: 'gpt-5.6-luna',
    });

    expect(parsed).toMatchObject({
      message: 'What does adjusted profit mean this month?',
      reasoningEffort: 'medium',
    });
    expect(adminAiChatRequestSchema.safeParse({ ...parsed, extra: 'not accepted' }).success).toBe(
      false,
    );
    expect(
      adminAiChatRequestSchema.safeParse({ ...parsed, autoAcceptProposals: true }).success,
    ).toBe(false);
  });

  it('keeps runtime instructions lean and lets the connected tools describe capability', () => {
    const instructions = adminAiRuntimeInstructions({
      locale: 'en',
      currentDate: '2026-08-28',
    });
    expect(instructions).toContain('Current application date in Africa/Algiers: 2026-08-28');
    expect(instructions).toContain('Use no more text than the operator needs');
    expect(instructions).not.toContain('Connected capability map');
    expect(instructions).not.toContain('No mutation capability');
    expect(instructions).not.toContain('inventoryQuantity');
  });

  it('retrieves only model-selected canonical guidance topics', () => {
    const result = readAdminAiGuidance({
      topics: ['analytics_profit', 'analytics_order_lifecycle', 'analytics_profit'],
    });

    expect(result.topics.map((topic) => topic.topic)).toEqual([
      'analytics_profit',
      'analytics_order_lifecycle',
    ]);
    expect(result.topics[0]).toMatchObject({
      owner: 'Analytics economics engine',
      facts: {
        adjustedProfit: expect.stringContaining('unresolved/shipping'),
        netProfit: expect.stringContaining('Meta ad cost'),
        trueProfit: expect.stringContaining('operating costs'),
      },
    });
    expect(JSON.stringify(result)).not.toContain('resultClickRate');
  });

  it('keeps guidance selection bounded but lets the model combine relevant topics', () => {
    expect(
      adminAiGuidanceRequestSchema.safeParse({
        topics: ['analytics_profit', 'analytics_sources_and_coverage', 'ai_stats_operations'],
      }).success,
    ).toBe(true);
    expect(adminAiGuidanceRequestSchema.safeParse({ topics: [] }).success).toBe(false);
    expect(
      adminAiGuidanceRequestSchema.safeParse({ topics: ['unknown_implementation_topic'] }).success,
    ).toBe(false);
  });

  it('makes compact catalog knowledge available without exposing unrelated topics', () => {
    const result = readAdminAiGuidanceForTopics(['catalog'], { topics: ['catalog'] });

    expect(result.topics).toEqual([
      expect.objectContaining({
        topic: 'catalog',
        owner: 'Catalog system',
        facts: expect.objectContaining({
          availability: expect.stringContaining('inventoryQuantity is the internal count'),
          historyAndPerformance: expect.stringContaining(
            'Use Analytics for dated business performance',
          ),
        }),
      }),
    ]);
    expect(
      adminAiGuidanceRequestSchemaForTopics(['catalog']).safeParse({
        topics: ['analytics_profit'],
      }).success,
    ).toBe(false);
    expect(() =>
      readAdminAiGuidanceForTopics(['catalog'], { topics: ['analytics_profit'] }),
    ).toThrow();
  });

  it('retrieves concise order and EcoTrack contracts only when selected', () => {
    const result = readAdminAiGuidanceForTopics(['orders'], { topics: ['orders'] });

    expect(result.topics).toEqual([
      expect.objectContaining({
        topic: 'orders',
        owner: 'Orders and EcoTrack system',
        facts: expect.objectContaining({
          happyPath: expect.stringContaining('EcoTrack normally owns further shipment progress'),
          statusSystems: expect.stringContaining('distinct statuses'),
          inHouseStatuses: expect.stringContaining('manual_completed'),
          ecotrackMapping: expect.stringContaining('seven days'),
          posting: expect.stringContaining('an entered customer name is not'),
          shipmentActions: expect.stringContaining(
            'restores an in-house posted order to confirmed',
          ),
          exports: expect.stringContaining('does not change the in-house order status'),
        }),
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain('analytics_profit');
    expect(JSON.stringify(result.topics[0]?.facts).length).toBeLessThan(3_000);
  });

  it('uses the Algeria business date and preserves readable bounded titles', () => {
    expect(adminAiApplicationDate(new Date('2026-08-27T23:30:00.000Z'))).toBe('2026-08-28');
    expect(adminAiConversationTitle(`  ${'a'.repeat(100)}  `)).toHaveLength(78);
  });
});
