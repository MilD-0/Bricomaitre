import { describe, expect, it, vi } from 'vitest';

import { consumeShoppingAssistantResponse } from './shopping-assistant-stream';

const product = {
  id: 1,
  token: 'drill',
  title: 'Perceuse',
  titleAr: null,
  description: null,
  descriptionAr: null,
  price: '5000.00',
  oldPrice: null,
  inStock: true,
  availabilityStatus: 'in_stock',
  imageUrl: null,
  brand: null,
  category: null,
};

describe('shopping assistant response stream', () => {
  it('delivers text incrementally before the final product result', async () => {
    const encoder = new TextEncoder();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              '{"type":"status","status":"thinking"}\n{"type":"text-delta","delta":"Voici "}\n',
            ),
          );
          controller.enqueue(
            encoder.encode(
              `{"type":"text-delta","delta":"une option."}\n${JSON.stringify({ type: 'result', mode: 'ai', products: [product] })}\n`,
            ),
          );
          controller.close();
        },
      }),
      { headers: { 'content-type': 'application/x-ndjson' } },
    );
    const deltas: string[] = [];
    const onResult = vi.fn();

    await consumeShoppingAssistantResponse(response, {
      onTextDelta: (delta) => deltas.push(delta),
      onResult,
    });

    expect(deltas).toEqual(['Voici ', 'une option.']);
    expect(onResult).toHaveBeenCalledWith({ mode: 'ai', products: [product] });
  });

  it('retains compatibility with the previous JSON response during rollout', async () => {
    const onTextDelta = vi.fn();
    const onResult = vi.fn();
    const response = Response.json({ message: 'Résultat', mode: 'fallback', products: [] });

    await consumeShoppingAssistantResponse(response, { onTextDelta, onResult });

    expect(onTextDelta).toHaveBeenCalledWith('Résultat');
    expect(onResult).toHaveBeenCalledWith({ mode: 'fallback', products: [] });
  });
});
