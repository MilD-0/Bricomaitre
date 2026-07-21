import {
  shoppingAssistantResponseSchema,
  shoppingAssistantStreamEventSchema,
  type ShoppingAssistantResponse,
} from '@bric/storefront-core/shopping-assistant-contracts';

export async function consumeShoppingAssistantResponse(
  response: Response,
  handlers: {
    onTextDelta: (delta: string) => void;
    onResult: (result: Omit<ShoppingAssistantResponse, 'message'>) => void;
  },
) {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const result = shoppingAssistantResponseSchema.parse(await response.json());
    handlers.onTextDelta(result.message);
    handlers.onResult({ mode: result.mode, products: result.products });
    return;
  }
  if (!response.body || !contentType.includes('application/x-ndjson')) {
    throw new Error('invalid_assistant_stream');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;

  const consumeLine = (line: string) => {
    if (!line.trim()) return;
    const event = shoppingAssistantStreamEventSchema.parse(JSON.parse(line));
    if (event.type === 'text-delta') handlers.onTextDelta(event.delta);
    if (event.type === 'result') {
      completed = true;
      handlers.onResult({ mode: event.mode, products: event.products });
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
  if (!completed) throw new Error('incomplete_assistant_stream');
}
