import { createAiLanguageModel, getAiConfig, resolveAiModel } from '@bric/ai-core';
import {
  shoppingAssistantCatalogSearchSchema,
  shoppingAssistantProductLookupSchema,
  shoppingAssistantRequestSchema,
  shoppingAssistantResponseSchema,
  shoppingAssistantStreamEventSchema,
  type ShoppingAssistantProduct,
  type ShoppingAssistantRequest,
  type ShoppingAssistantStreamEvent,
} from '@bric/storefront-core/shopping-assistant-contracts';
import { stepCountIs, streamText, tool } from 'ai';
import { NextRequest, NextResponse } from 'next/server';

import {
  catalogSearchQuery,
  deterministicAssistantMessage,
  shoppingAssistantInstructions,
  toAssistantCatalogProduct,
  toAssistantDetailProduct,
} from '@/lib/shopping-assistant';
import {
  enforceShoppingAssistantRateLimit,
  shoppingAssistantRateLimitHeaders,
} from '@/lib/shopping-assistant-rate-limit';
import {
  fetchStorefrontCatalog,
  fetchStorefrontCatalogMeta,
  fetchStorefrontProductDetail,
  getStorefrontSettings,
  recordStorefrontAssistantRun,
} from '@/lib/storefront-api';
import { defaultStorefrontSettingsResponse } from '@bric/storefront-core/contracts';

function catalogQuery(search: string, limit: number) {
  return {
    page: 1,
    limit: Math.min(24, Math.max(limit * 3, limit)),
    search,
    brandId: null,
    categoryId: null,
    discounted: false,
    sortKey: 'recommended' as const,
    sortDirection: 'desc' as const,
    id: null,
    mongoId: null,
    slug: null,
  };
}

async function searchPublicCatalog(input: { query: string; inStockOnly: boolean; limit: number }) {
  const [catalog, meta] = await Promise.all([
    fetchStorefrontCatalog(catalogQuery(input.query, input.limit)),
    fetchStorefrontCatalogMeta(),
  ]);
  const brandNames = new Map(meta.brands.map((brand) => [brand.id, brand.name]));
  const categoryNames = new Map(meta.categories.map((category) => [category.id, category.name]));
  return catalog.items
    .filter((product) => !input.inStockOnly || product.inStock)
    .slice(0, input.limit)
    .map((product) =>
      toAssistantCatalogProduct(product, {
        brand: product.brandId ? (brandNames.get(product.brandId) ?? null) : null,
        category: product.categoryId ? (categoryNames.get(product.categoryId) ?? null) : null,
      }),
    );
}

function remember(products: ShoppingAssistantProduct[], product: ShoppingAssistantProduct | null) {
  if (!product) return;
  const existingIndex = products.findIndex((item) => item.id === product.id);
  if (existingIndex >= 0) products.splice(existingIndex, 1);
  products.push(product);
  if (products.length > 8) products.splice(0, products.length - 8);
}

function conversationPrompt(input: ShoppingAssistantRequest) {
  return input.messages
    .map((message) => `${message.role === 'user' ? 'Customer' : 'Advisor'}: ${message.content}`)
    .join('\n');
}

function groundedConversationPrompt(
  input: ShoppingAssistantRequest,
  products: ShoppingAssistantProduct[],
) {
  return [
    conversationPrompt(input),
    '',
    'The application already searched the live catalog for this request. Answer directly using only this public catalog evidence; do not ask to search again:',
    JSON.stringify(products),
  ].join('\n');
}

async function deterministicFallback(
  input: ShoppingAssistantRequest,
  remembered: ShoppingAssistantProduct[],
) {
  let products = [...remembered];
  if (!products.length) {
    const lastQuestion =
      [...input.messages].reverse().find((message) => message.role === 'user')?.content ?? '';
    if (lastQuestion) {
      products = await searchPublicCatalog({
        query: lastQuestion.slice(0, 160),
        inStockOnly: true,
        limit: 5,
      }).catch(() => []);
    }
  }
  return shoppingAssistantResponseSchema.parse({
    mode: 'fallback',
    message: deterministicAssistantMessage(input.locale, products.length),
    products,
  });
}

export async function POST(request: NextRequest) {
  let rateLimit: Awaited<ReturnType<typeof enforceShoppingAssistantRateLimit>>;
  let body: unknown;
  let settings;
  try {
    [rateLimit, body, settings] = await Promise.all([
      enforceShoppingAssistantRateLimit(request),
      request.json().catch(() => null),
      getStorefrontSettings().catch(() => defaultStorefrontSettingsResponse),
    ]);
  } catch {
    return NextResponse.json({ error: 'assistant_unavailable' }, { status: 503 });
  }
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: 'assistant_rate_limited' },
      {
        status: 429,
        headers: shoppingAssistantRateLimitHeaders(rateLimit),
      },
    );
  }

  if (!settings.aiAssistantEnabled) {
    return NextResponse.json({ error: 'assistant_disabled' }, { status: 404 });
  }

  const parsed = shoppingAssistantRequestSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: 'invalid_assistant_request' }, { status: 400 });
  const remembered: ShoppingAssistantProduct[] = [];
  const encoder = new TextEncoder();
  const responseStream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (event: ShoppingAssistantStreamEvent) => {
        const validated = shoppingAssistantStreamEventSchema.parse(event);
        controller.enqueue(encoder.encode(`${JSON.stringify(validated)}\n`));
      };
      write({ type: 'status', status: 'thinking' });

      void (async () => {
        const startedAt = Date.now();
        let modelName = 'unconfigured';
        let toolCallCount = 0;
        let emittedText = '';
        let usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } = {};
        try {
          const config = getAiConfig();
          modelName = resolveAiModel(config, 'storefront');
          const lastQuestion =
            [...parsed.data.messages].reverse().find((message) => message.role === 'user')
              ?.content ?? '';
          toolCallCount += 1;
          const prefetchedProducts = lastQuestion
            ? await searchPublicCatalog({
                query: catalogSearchQuery(lastQuestion),
                inStockOnly: false,
                limit: 3,
              }).catch((error) => {
                console.error(
                  '[shopping-assistant] catalog prefetch failed',
                  error instanceof Error ? error.message : 'unknown error',
                );
                return [];
              })
            : [];
          prefetchedProducts.forEach((product) => remember(remembered, product));
          const generationOptions = {
            model: createAiLanguageModel(config, 'storefront'),
            instructions: shoppingAssistantInstructions(parsed.data.locale),
            prompt: prefetchedProducts.length
              ? groundedConversationPrompt(parsed.data, prefetchedProducts)
              : conversationPrompt(parsed.data),
            abortSignal: AbortSignal.timeout(config.requestTimeoutMs),
            maxRetries: config.maxRetries,
          };
          const result = prefetchedProducts.length
            ? streamText(generationOptions)
            : streamText({
                ...generationOptions,
                stopWhen: stepCountIs(5),
                tools: {
                  search_catalog: tool({
                    description:
                      'Search the live public Bricomaitre catalog before recommending products.',
                    inputSchema: shoppingAssistantCatalogSearchSchema,
                    execute: async (input) => {
                      toolCallCount += 1;
                      const products = await searchPublicCatalog(input);
                      products.forEach((product) => remember(remembered, product));
                      return { products, count: products.length };
                    },
                  }),
                  inspect_products: tool({
                    description:
                      'Inspect up to four public products by ID or slug before answering detailed questions or comparisons.',
                    inputSchema: shoppingAssistantProductLookupSchema,
                    execute: async ({ tokens }) => {
                      toolCallCount += 1;
                      const products = (
                        await Promise.all(
                          tokens.map((token) => fetchStorefrontProductDetail(token)),
                        )
                      )
                        .filter((product) => product !== null)
                        .map((product) => toAssistantDetailProduct(product.item));
                      products.forEach((product) => remember(remembered, product));
                      return { products };
                    },
                  }),
                },
              });

          for await (const part of result.stream) {
            if (part.type === 'tool-call') write({ type: 'status', status: 'catalog' });
            if (part.type === 'text-delta' && part.text && emittedText.length < 4_000) {
              const delta = part.text.slice(0, 4_000 - emittedText.length);
              if (delta) {
                emittedText += delta;
                write({ type: 'text-delta', delta });
              }
            }
            if (part.type === 'finish') usage = part.totalUsage;
            if (part.type === 'error') throw part.error;
          }

          if (!emittedText.trim()) {
            const fallback = await deterministicFallback(parsed.data, remembered);
            write({ type: 'text-delta', delta: fallback.message });
            write({ type: 'result', mode: fallback.mode, products: fallback.products });
            void recordStorefrontAssistantRun({
              telemetry: parsed.data.telemetry,
              locale: parsed.data.locale,
              status: 'completed',
              mode: 'fallback',
              model: modelName,
              ...usage,
              durationMs: Date.now() - startedAt,
              toolCalls: toolCallCount,
              resultsCount: remembered.length,
            }).catch(() => {});
            return;
          }

          const finalResult = shoppingAssistantResponseSchema.parse({
            mode: 'ai',
            message: emittedText,
            products: remembered,
          });
          write({ type: 'result', mode: finalResult.mode, products: finalResult.products });
          void recordStorefrontAssistantRun({
            telemetry: parsed.data.telemetry,
            locale: parsed.data.locale,
            status: 'completed',
            mode: 'ai',
            model: modelName,
            ...usage,
            durationMs: Date.now() - startedAt,
            toolCalls: toolCallCount,
            resultsCount: remembered.length,
          }).catch(() => {});
        } catch {
          void recordStorefrontAssistantRun({
            telemetry: parsed.data.telemetry,
            locale: parsed.data.locale,
            status: 'failed',
            mode: 'fallback',
            model: modelName,
            ...usage,
            durationMs: Date.now() - startedAt,
            toolCalls: toolCallCount,
            resultsCount: remembered.length,
          }).catch(() => {});
          if (emittedText) {
            write({ type: 'error', code: 'assistant_unavailable' });
            return;
          }
          const fallback = await deterministicFallback(parsed.data, remembered).catch(() => null);
          if (!fallback) {
            write({ type: 'error', code: 'assistant_unavailable' });
            return;
          }
          write({ type: 'text-delta', delta: fallback.message });
          write({ type: 'result', mode: fallback.mode, products: fallback.products });
        } finally {
          controller.close();
        }
      })();
    },
  });

  return new NextResponse(responseStream, {
    headers: {
      'cache-control': 'no-cache, no-transform',
      'content-type': 'application/x-ndjson; charset=utf-8',
      'x-accel-buffering': 'no',
    },
  });
}
