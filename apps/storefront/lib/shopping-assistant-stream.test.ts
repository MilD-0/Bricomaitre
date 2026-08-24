import { describe, expect, it, vi } from 'vitest';

import { consumeShoppingAssistantResponse } from './shopping-assistant-stream';

const product = {
  id: 1,
  token: 'drill',
  title: 'Perceuse',
  titleAr: null,
  description: null,
  descriptionAr: null,
  sku: null,
  characteristics: [],
  characteristicsAr: [],
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
              '{"type":"status","status":"thinking"}\n{"type":"tool","name":"search_catalog","status":"started"}\n{"type":"tool","name":"search_catalog","status":"completed"}\n{"type":"text-delta","delta":"Voici "}\n',
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
    const activities: unknown[] = [];
    const onResult = vi.fn();

    await consumeShoppingAssistantResponse(response, {
      onActivity: (activity) => activities.push(activity),
      onTextDelta: (delta) => deltas.push(delta),
      onResult,
    });

    expect(activities).toEqual([
      { type: 'status', status: 'thinking' },
      { type: 'tool', name: 'search_catalog', status: 'started' },
      { type: 'tool', name: 'search_catalog', status: 'completed' },
    ]);
    expect(deltas).toEqual(['Voici ', 'une option.']);
    expect(onResult).toHaveBeenCalledWith({
      mode: 'ai',
      products: [product],
      cartMutations: [],
    });
  });

  it('retains compatibility with the previous JSON response during rollout', async () => {
    const onTextDelta = vi.fn();
    const onResult = vi.fn();
    const response = Response.json({ message: 'Résultat', mode: 'fallback', products: [] });

    await consumeShoppingAssistantResponse(response, { onTextDelta, onResult });

    expect(onTextDelta).toHaveBeenCalledWith('Résultat');
    expect(onResult).toHaveBeenCalledWith({
      mode: 'fallback',
      products: [],
      cartMutations: [],
    });
  });

  it('delivers grounded cart mutations only with the final result', async () => {
    const onResult = vi.fn();
    const cartMutation = { action: 'add', quantity: 2, product };
    const response = new Response(
      `${JSON.stringify({ type: 'text-delta', delta: 'Ajout effectué.' })}\n${JSON.stringify({ type: 'result', mode: 'ai', products: [], cartMutations: [cartMutation] })}\n`,
      { headers: { 'content-type': 'application/x-ndjson' } },
    );

    await consumeShoppingAssistantResponse(response, {
      onTextDelta: vi.fn(),
      onResult,
    });

    expect(onResult).toHaveBeenCalledWith({
      mode: 'ai',
      products: [],
      cartMutations: [cartMutation],
    });
  });

  it('exposes grounded products before rejecting an interrupted response', async () => {
    const onError = vi.fn();
    const response = new Response(
      `${JSON.stringify({ type: 'text-delta', delta: 'Voici une option' })}\n${JSON.stringify({ type: 'error', code: 'assistant_unavailable', products: [product] })}\n`,
      { headers: { 'content-type': 'application/x-ndjson' } },
    );

    await expect(
      consumeShoppingAssistantResponse(response, {
        onTextDelta: vi.fn(),
        onResult: vi.fn(),
        onError,
      }),
    ).rejects.toThrow('assistant_unavailable');
    expect(onError).toHaveBeenCalledWith({
      code: 'assistant_unavailable',
      products: [product],
    });
  });
});
