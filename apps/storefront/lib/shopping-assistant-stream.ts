import {
  shoppingAssistantResponseSchema,
  shoppingAssistantStreamEventSchema,
  type ShoppingAssistantProduct,
  type ShoppingAssistantResponse,
  type ShoppingAssistantStreamEvent,
} from '@bric/storefront-core/shopping-assistant-contracts';

export type ShoppingAssistantActivity = Extract<
  ShoppingAssistantStreamEvent,
  { type: 'status' | 'tool' }
>;

export async function consumeShoppingAssistantResponse(
  response: Response,
  handlers: {
    onActivity?: (activity: ShoppingAssistantActivity) => void;
    onTextDelta: (delta: string) => void;
    onResult: (result: Omit<ShoppingAssistantResponse, 'message'>) => void;
    onError?: (error: {
      code: 'assistant_unavailable';
      products?: ShoppingAssistantProduct[];
    }) => void;
  },
) {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const result = shoppingAssistantResponseSchema.parse(await response.json());
    handlers.onTextDelta(result.message);
    handlers.onResult({
      mode: result.mode,
      products: result.products,
      cartMutations: result.cartMutations,
    });
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
    if (event.type === 'status' || event.type === 'tool') handlers.onActivity?.(event);
    if (event.type === 'text-delta') handlers.onTextDelta(event.delta);
    if (event.type === 'result') {
      if (completed) throw new Error('duplicate_assistant_result');
      completed = true;
      handlers.onResult({
        mode: event.mode,
        products: event.products,
        cartMutations: event.cartMutations,
      });
    }
    if (event.type === 'error') {
      handlers.onError?.({ code: event.code, products: event.products });
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
  if (!completed) throw new Error('incomplete_assistant_stream');
}
