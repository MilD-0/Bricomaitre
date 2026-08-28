import { z } from 'zod';

const adminAiConversationSchema = z
  .object({
    id: z.number().int().positive(),
    sessionKey: z.uuid(),
    title: z.string(),
  })
  .strict();

export const adminAiChatStreamEventSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('status'),
      status: z.enum(['thinking', 'working']),
      toolName: z.string().trim().min(1).max(100).optional(),
      phase: z.enum(['running', 'completed', 'failed']).optional(),
    })
    .strict(),
  z.object({ type: z.literal('text-delta'), delta: z.string().min(1).max(4_000) }).strict(),
  z
    .object({
      type: z.literal('result'),
      toolResults: z.unknown(),
      conversation: adminAiConversationSchema,
      messageId: z.number().int().positive().nullable().default(null),
    })
    .strict(),
  z
    .object({
      type: z.literal('error'),
      code: z.literal('admin_ai_failed'),
      message: z.string(),
      conversation: adminAiConversationSchema,
      messageId: z.number().int().positive().nullable(),
      toolResults: z.unknown().optional(),
    })
    .strict(),
]);

export type AdminAiConversation = z.infer<typeof adminAiConversationSchema>;
export type AdminAiChatStreamEvent = z.infer<typeof adminAiChatStreamEventSchema>;
export type AdminAiChatStatus = Extract<AdminAiChatStreamEvent, { type: 'status' }>;

export async function consumeAdminAiChatResponse(
  response: Response,
  handlers: {
    onStatus?: (status: AdminAiChatStatus) => void;
    onTextDelta: (delta: string) => void;
    onResult: (result: {
      toolResults: unknown;
      conversation: AdminAiConversation;
      messageId: number | null;
    }) => void;
    onError?: (error: {
      code: 'admin_ai_failed';
      message: string;
      conversation: AdminAiConversation;
      messageId: number | null;
      toolResults?: unknown;
    }) => void;
  },
) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/x-ndjson')) {
    const body = (await response.json()) as {
      message?: unknown;
      error?: unknown;
      toolResults?: unknown;
      conversation?: unknown;
      messageId?: unknown;
    };
    if (!response.ok)
      throw new Error(typeof body.error === 'string' ? body.error : 'admin_ai_failed');
    if (typeof body.message === 'string' && body.message) handlers.onTextDelta(body.message);
    handlers.onResult({
      toolResults: body.toolResults,
      conversation: adminAiConversationSchema.parse(body.conversation),
      messageId:
        typeof body.messageId === 'number' && Number.isSafeInteger(body.messageId)
          ? body.messageId
          : null,
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
    if (event.type === 'status') handlers.onStatus?.(event);
    if (event.type === 'text-delta') handlers.onTextDelta(event.delta);
    if (event.type === 'result') {
      completed = true;
      handlers.onResult({
        toolResults: event.toolResults,
        conversation: event.conversation,
        messageId: event.messageId,
      });
    }
    if (event.type === 'error') {
      handlers.onError?.({
        code: event.code,
        message: event.message,
        conversation: event.conversation,
        messageId: event.messageId,
        toolResults: event.toolResults,
      });
      throw new Error(event.code);
    }
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
