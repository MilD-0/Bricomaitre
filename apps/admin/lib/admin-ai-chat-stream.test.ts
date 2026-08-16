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
              '{"type":"status","status":"thinking"}\n{"type":"text-delta","delta":"First "}\n',
            ),
          );
          controller.enqueue(
            encoder.encode(
              `${JSON.stringify({ type: 'text-delta', delta: 'answer.' })}\n${JSON.stringify({ type: 'result', toolResults: [], conversation })}\n`,
            ),
          );
          controller.close();
        },
      }),
      { headers: { 'content-type': 'application/x-ndjson' } },
    );
    const deltas: string[] = [];
    const onResult = vi.fn();

    await consumeAdminAiChatResponse(response, {
      onTextDelta: (delta) => deltas.push(delta),
      onResult,
    });

    expect(deltas).toEqual(['First ', 'answer.']);
    expect(onResult).toHaveBeenCalledWith({ toolResults: [], conversation });
  });

  it('accepts the previous JSON payload during rollout', async () => {
    const onTextDelta = vi.fn();
    const onResult = vi.fn();
    await consumeAdminAiChatResponse(
      Response.json({ message: 'Done', toolResults: [], conversation }),
      { onTextDelta, onResult },
    );
    expect(onTextDelta).toHaveBeenCalledWith('Done');
    expect(onResult).toHaveBeenCalledWith({ toolResults: [], conversation });
  });
});
