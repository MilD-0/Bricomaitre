import { describe, expect, it } from 'vitest';

import {
  buildAdminAiConversationContext,
  latestAdminAiAnalyticsContinuation,
} from './admin-ai-conversation-context';

describe('admin AI conversation context', () => {
  it('retains long conversations beyond 20 messages and restores exact saved tool evidence', () => {
    const rows = Array.from({ length: 28 }, (_, index) => ({
      role: index % 2 === 0 ? 'assistant' : 'user',
      content:
        index === 0
          ? {
              text: 'I found the exact product.',
              toolResults: [
                {
                  type: 'tool-result',
                  toolName: 'find_products',
                  output: [{ id: 481, title: 'Professional impact drill' }],
                },
              ],
            }
          : { text: `Saved message ${28 - index}` },
    }));

    const context = buildAdminAiConversationContext(rows);

    expect(context).toHaveLength(28);
    expect(context[0]?.content).toBe('Saved message 1');
    expect(context.at(-1)?.content).toContain('Saved canonical tool evidence');
    expect(context.at(-1)?.content).toContain('"id":481');
    expect(context.at(-1)?.content).toContain('"toolName":"find_products"');
  });

  it('restores complete messages in chronological order', () => {
    const newestFirst = [
      { role: 'assistant', content: { text: 'Newest assistant answer' } },
      { role: 'user', content: { text: 'Newest user question' } },
      { role: 'assistant', content: { text: 'x'.repeat(2_000) } },
      { role: 'user', content: { text: 'Older question' } },
    ];

    const context = buildAdminAiConversationContext(newestFirst);

    expect(context).toEqual([
      { role: 'user', content: 'Older question' },
      { role: 'assistant', content: 'x'.repeat(2_000) },
      { role: 'user', content: 'Newest user question' },
      { role: 'assistant', content: 'Newest assistant answer' },
    ]);
  });

  it('restores full analytics evidence beyond the former evidence and context budgets', () => {
    const evidence = [
      { toolName: 'query_analytics', output: { rows: 'x'.repeat(100_000), lastOrderId: 481 } },
    ];
    const context = buildAdminAiConversationContext([
      {
        role: 'assistant',
        content: { text: 'Inspect these orders.', toolResults: evidence },
      },
    ]);
    const serialized = context[0]!.content.split('instructions):\n')[1]!;
    expect(JSON.parse(serialized)).toEqual(evidence);
  });

  it('restores the latest canonical analytics query for conversational follow-ups', () => {
    const continuation = latestAdminAiAnalyticsContinuation([
      {
        role: 'assistant',
        content: {
          text: 'Campaign Alpha declined.',
          toolResults: [
            {
              type: 'tool-result',
              toolName: 'query_analytics',
              input: { view: 'acquisition', range: '30d' },
              output: {
                view: 'acquisition',
                filters: {
                  view: 'acquisition',
                  range: 'custom',
                  startDate: '2026-08-01',
                  endDate: '2026-08-23',
                  grain: 'day',
                },
                focus: {
                  dimension: 'campaigns',
                  search: 'Alpha',
                  identifiers: ['cmp-1'],
                  limit: 20,
                },
              },
            },
          ],
        },
      },
    ]);

    expect(continuation).toEqual({
      view: 'acquisition',
      range: 'custom',
      startDate: '2026-08-01',
      endDate: '2026-08-23',
      grain: 'day',
      focus: {
        dimension: 'campaigns',
        search: 'Alpha',
        identifiers: ['cmp-1'],
        limit: 20,
      },
    });
  });

  it('does not resurrect stale analytics after a newer tool-bearing subject change', () => {
    expect(
      latestAdminAiAnalyticsContinuation([
        {
          role: 'assistant',
          content: {
            text: 'Product updated.',
            toolResults: [{ type: 'tool-result', toolName: 'update_products', output: {} }],
          },
        },
        {
          role: 'assistant',
          content: {
            text: 'Earlier analytics.',
            toolResults: [
              {
                type: 'tool-result',
                toolName: 'query_analytics',
                output: { view: 'money', filters: { range: '30d' } },
              },
            ],
          },
        },
      ]),
    ).toBeNull();
  });
});
