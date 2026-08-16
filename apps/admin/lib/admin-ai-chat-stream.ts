import { z } from 'zod';

const adminAiConversationSchema = z
  .object({
    id: z.number().int().positive(),
    sessionKey: z.uuid(),
    title: z.string(),
  })
  .strict();

export const adminAiChatStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('status'), status: z.enum(['thinking', 'working']) }).strict(),
  z.object({ type: z.literal('text-delta'), delta: z.string().min(1).max(4_000) }).strict(),
  z
    .object({
      type: z.literal('result'),
      toolResults: z.unknown(),
      conversation: adminAiConversationSchema,
    })
    .strict(),
  z.object({ type: z.literal('error'), code: z.literal('admin_ai_failed') }).strict(),
]);

export type AdminAiConversation = z.infer<typeof adminAiConversationSchema>;
export type AdminAiChatStreamEvent = z.infer<typeof adminAiChatStreamEventSchema>;

export async function consumeAdminAiChatResponse(
  response: Response,
  handlers: {
    onTextDelta: (delta: string) => void;
    onResult: (result: { toolResults: unknown; conversation: AdminAiConversation }) => void;
  },
) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/x-ndjson')) {
    const body = (await response.json()) as {
      message?: unknown;
      error?: unknown;
      toolResults?: unknown;
      conversation?: unknown;
    };
    if (!response.ok)
      throw new Error(typeof body.error === 'string' ? body.error : 'admin_ai_failed');
    if (typeof body.message === 'string' && body.message) handlers.onTextDelta(body.message);
    handlers.onResult({
      toolResults: body.toolResults,
      conversation: adminAiConversationSchema.parse(body.conversation),
    });
    return;
  }
  if (!response.ok || !response.body) throw new Error('admin_ai_failed');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;
  const consumeLine = (line: string) => {
    if (!line.trim()) return;
    const event = adminAiChatStreamEventSchema.parse(JSON.parse(line));
    if (event.type === 'text-delta') handlers.onTextDelta(event.delta);
    if (event.type === 'result') {
      completed = true;
      handlers.onResult({ toolResults: event.toolResults, conversation: event.conversation });
    }
    if (event.type === 'error') throw new Error(event.code);
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    lines.forEach(consumeLine);
    if (done) break;
  }
  consumeLine(buffer);
  if (!completed) throw new Error('incomplete_admin_ai_stream');
}
