import { describe, expect, it } from 'vitest';

import { buildAdminAiConversationContext } from './admin-ai-conversation-context';

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

  it('applies configured context and saved-evidence character limits', () => {
    const newest = {
      role: 'assistant',
      content: { text: 'Newest answer', toolResults: [{ output: 'x'.repeat(200) }] },
    };
    const boundedNewest = buildAdminAiConversationContext([newest], {
      toolEvidenceCharacterLimit: 100,
    })[0]!;
    const context = buildAdminAiConversationContext(
      [newest, { role: 'user', content: { text: 'Older question that should not fit' } }],
      {
        characterLimit: boundedNewest.content.length,
        toolEvidenceCharacterLimit: 100,
      },
    );

    expect(context).toHaveLength(1);
    expect(context[0]!.content).toContain('saved tool evidence truncated');
    expect(context[0]!.content).not.toContain('Older question');
    expect(context[0]!.content.split('instructions):\n')[1]).toHaveLength(100);
  });
});
