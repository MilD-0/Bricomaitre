import { describe, expect, it, vi } from 'vitest';

import { consumeAdminAiChatResponse } from './admin-ai-chat-stream';

const conversation = {
  id: 7,
  sessionKey: '08ae5e04-bc1e-4b38-870f-49000e23663a',
  title: 'Catalog help',
};

describe('admin AI chat response stream', () => {
  it('delivers incremental text before the final tool and conversation data', async () => {
    const encoder = new TextEncoder();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              '{"type":"status","status":"thinking"}\n{"type":"status","status":"working","toolName":"find_products","phase":"running"}\n{"type":"text-delta","delta":"First "}\n',
            ),
          );
          controller.enqueue(
            encoder.encode(
              `${JSON.stringify({ type: 'text-delta', delta: 'answer.' })}\n${JSON.stringify({ type: 'result', toolResults: [], conversation, messageId: 91 })}\n`,
            ),
          );
          controller.close();
        },
      }),
      { headers: { 'content-type': 'application/x-ndjson' } },
    );
    const deltas: string[] = [];
    const statuses: unknown[] = [];
    const onResult = vi.fn();

    await consumeAdminAiChatResponse(response, {
      onStatus: (status) => statuses.push(status),
      onTextDelta: (delta) => deltas.push(delta),
      onResult,
    });

    expect(statuses).toEqual([
      { type: 'status', status: 'thinking' },
      {
        type: 'status',
        status: 'working',
        toolName: 'find_products',
        phase: 'running',
      },
    ]);
    expect(deltas).toEqual(['First ', 'answer.']);
    expect(onResult).toHaveBeenCalledWith({ toolResults: [], conversation, messageId: 91 });
  });

  it('accepts the previous JSON payload during rollout', async () => {
    const onTextDelta = vi.fn();
    const onResult = vi.fn();
    await consumeAdminAiChatResponse(
      Response.json({ message: 'Done', toolResults: [], conversation }),
      { onTextDelta, onResult },
    );
    expect(onTextDelta).toHaveBeenCalledWith('Done');
    expect(onResult).toHaveBeenCalledWith({ toolResults: [], conversation, messageId: null });
  });

  it('exposes completed tool evidence before rejecting an interrupted stream', async () => {
    const toolResults = [
      {
        type: 'tool-result',
        toolName: 'update_order_status',
        output: { items: [{ orderId: 91, statusLabel: 'confirmed' }] },
      },
    ];
    const onError = vi.fn();
    const failure = {
      type: 'error',
      code: 'admin_ai_failed',
      message: 'Order updated.\n\nThis response stopped before completion.',
      conversation,
      messageId: 92,
      toolResults,
    };
    const response = new Response(
      `${JSON.stringify({ type: 'text-delta', delta: 'Order updated.' })}\n${JSON.stringify(failure)}\n`,
      { headers: { 'content-type': 'application/x-ndjson' } },
    );

    await expect(
      consumeAdminAiChatResponse(response, {
        onTextDelta: vi.fn(),
        onResult: vi.fn(),
        onError,
      }),
    ).rejects.toThrow('admin_ai_failed');
    expect(onError).toHaveBeenCalledWith({
      code: 'admin_ai_failed',
      message: failure.message,
      conversation,
      messageId: 92,
      toolResults,
    });
  });
});
