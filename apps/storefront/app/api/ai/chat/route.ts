import { createAiLanguageModel, getAiConfig, resolveAiModel } from '@bric/ai-core';
import {
  defaultStorefrontSettingsResponse,
  type StorefrontSettingsResponse,
} from '@bric/storefront-core/contracts';
import {
  shoppingAssistantCatalogSearchResultSchema,
  shoppingAssistantCatalogSearchSchema,
  shoppingAssistantProductLookupSchema,
  shoppingAssistantProductSelectionSchema,
  shoppingAssistantRequestSchema,
  shoppingAssistantResponseSchema,
  shoppingAssistantStreamEventSchema,
  shoppingAssistantToolNameSchema,
  type ShoppingAssistantCatalogSearch,
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
  fetchStorefrontCartValidation,
  fetchStorefrontAssets,
  fetchStorefrontCatalog,
  fetchStorefrontCatalogMeta,
  fetchStorefrontProductDetail,
  getStorefrontSettings,
  recordStorefrontAssistantRun,
} from '@/lib/storefront-api';

const CATALOG_CACHE_SECONDS = 300;
const STOREFRONT_AI_PROMPT_VERSION = 'storefront-shopping-v2';
const catalogSearchCache = new Map<
  string,
  {
    expiresAt: number;
    result: ReturnType<typeof shoppingAssistantCatalogSearchResultSchema.parse>;
  }
>();
let productCardCache:
  | {
      expiresAt: number;
      cards: Map<number, Awaited<ReturnType<typeof fetchStorefrontAssets>>['productCards'][number]>;
    }
  | undefined;

async function loadProductCards() {
  if (productCardCache && productCardCache.expiresAt > Date.now()) return productCardCache.cards;
  const assets = await fetchStorefrontAssets();
  const cards = new Map(assets.productCards.map((card) => [card.productId, card] as const));
  productCardCache = { cards, expiresAt: Date.now() + CATALOG_CACHE_SECONDS * 1_000 };
  return cards;
}

async function searchPublicCatalog(input: ShoppingAssistantCatalogSearch, cacheSeconds = 0) {
  const query = shoppingAssistantCatalogSearchSchema.parse(input);
  const cacheKey = JSON.stringify(query);
  const cached = catalogSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const [catalog, meta, productCards] = await Promise.all([
    fetchStorefrontCatalog({
      ...query,
      id: null,
      mongoId: null,
      slug: null,
    }),
    fetchStorefrontCatalogMeta(),
    loadProductCards().catch(() => new Map()),
  ]);
  const brandNames = new Map(meta.brands.map((brand) => [brand.id, brand.name]));
  const categoryNames = new Map(meta.categories.map((category) => [category.id, category.name]));
  const result = shoppingAssistantCatalogSearchResultSchema.parse({
    products: catalog.items.map((product) =>
      toAssistantCatalogProduct(
        product,
        {
          brand: product.brandId ? (brandNames.get(product.brandId) ?? null) : null,
          category: product.categoryId ? (categoryNames.get(product.categoryId) ?? null) : null,
        },
        productCards.get(product.id),
      ),
    ),
    total: catalog.total,
    page: query.page,
    limit: query.limit,
    hasMore: query.page * query.limit < catalog.total,
  });

  // Empty pages can be transient during a rolling API refresh, so they are not negatively cached.
  if (cacheSeconds > 0 && result.products.length > 0) {
    catalogSearchCache.set(cacheKey, {
      result,
      expiresAt: Date.now() + cacheSeconds * 1_000,
    });
    if (catalogSearchCache.size > 200) {
      const oldest = catalogSearchCache.keys().next().value;
      if (oldest) catalogSearchCache.delete(oldest);
    }
  }
  return result;
}

function remember(
  products: Map<number, ShoppingAssistantProduct>,
  product: ShoppingAssistantProduct | null,
) {
  if (!product) return;
  products.delete(product.id);
  products.set(product.id, product);
}

function getStorefrontAiConfig(settings: StorefrontSettingsResponse) {
  const configured = getAiConfig();
  return {
    ...configured,
    provider: 'openrouter' as const,
    apiKey: process.env.OPENROUTER_API_KEY?.trim() || undefined,
    storefrontModel: settings.aiModel,
  };
}

function conversationPrompt(input: ShoppingAssistantRequest) {
  return input.messages
    .map((message) => {
      const references = message.productIds?.length
        ? ` [rendered product IDs: ${message.productIds.join(', ')}]`
        : '';
      return `${message.role === 'user' ? 'Customer' : 'Advisor'}: ${message.content}${references}`;
    })
    .join('\n');
}

function conciseProduct(product: ShoppingAssistantProduct) {
  return {
    id: product.id,
    token: product.token,
    title: product.title,
    titleAr: product.titleAr,
    description: product.description,
    descriptionAr: product.descriptionAr,
    sku: product.sku,
    characteristics: product.characteristics,
    characteristicsAr: product.characteristicsAr,
    price: product.price,
    oldPrice: product.oldPrice,
    inStock: product.inStock,
    availabilityStatus: product.availabilityStatus,
    brand: product.brand,
    category: product.category,
  };
}

type RequestGrounding = {
  currentProduct: ShoppingAssistantProduct | null;
  knownProducts: ShoppingAssistantProduct[];
  cart: Array<{ quantity: number; product: ShoppingAssistantProduct }>;
  catalogPage: Awaited<ReturnType<typeof searchPublicCatalog>> | null;
};

async function loadRequestGrounding(input: ShoppingAssistantRequest): Promise<RequestGrounding> {
  const context = input.context;
  if (!context) {
    return { currentProduct: null, knownProducts: [], cart: [], catalogPage: null };
  }

  const referencedIds = [
    ...context.cartItems.map((item) => item.productId),
    ...input.messages.flatMap((message) => message.productIds ?? []),
  ];
  const uniqueIds = [...new Set(referencedIds)].slice(0, 50);
  const [productCards, currentDetail, referencedItems, catalogPage] = await Promise.all([
    loadProductCards().catch(() => new Map()),
    context.currentProductToken
      ? fetchStorefrontProductDetail(context.currentProductToken).catch(() => null)
      : null,
    uniqueIds.length
      ? fetchStorefrontCartValidation(uniqueIds)
          .then((result) => result.items)
          .catch(() => [])
      : [],
    context.catalogQuery
      ? searchPublicCatalog(context.catalogQuery, CATALOG_CACHE_SECONDS).catch(() => null)
      : null,
  ]);
  const currentProduct = currentDetail
    ? toAssistantDetailProduct(currentDetail.item, productCards.get(currentDetail.item.id))
    : null;
  const referenced = referencedItems.map((product) =>
    toAssistantCatalogProduct(product, undefined, productCards.get(product.id)),
  );
  const products = new Map<number, ShoppingAssistantProduct>();
  referenced.forEach((product) => remember(products, product));
  catalogPage?.products.forEach((product) => remember(products, product));
  remember(products, currentProduct);
  const cartQuantities = new Map(
    context.cartItems.map((item) => [item.productId, item.quantity] as const),
  );

  return {
    currentProduct,
    knownProducts: [...products.values()],
    cart: referenced.flatMap((product) => {
      const quantity = cartQuantities.get(product.id);
      return quantity ? [{ quantity, product }] : [];
    }),
    catalogPage,
  };
}

function groundedPrompt(input: ShoppingAssistantRequest, grounding: RequestGrounding) {
  const context = input.context
    ? {
        pathname: input.context.pathname,
        catalogQuery: input.context.catalogQuery,
        currentProduct: grounding.currentProduct,
        cart: grounding.cart.map(({ quantity, product }) => ({
          quantity,
          product: conciseProduct(product),
        })),
        priorOrVisibleProducts: grounding.knownProducts.map(conciseProduct),
        currentCatalogPage: grounding.catalogPage
          ? {
              ...grounding.catalogPage,
              products: grounding.catalogPage.products.map(conciseProduct),
            }
          : null,
      }
    : null;
  return [
    conversationPrompt(input),
    '',
    'Application context and verified public catalog evidence (may be empty):',
    JSON.stringify(context),
    '',
    'The search_catalog tool queries the complete public catalog. Its total is the total matching the filters, not the number returned on one page. Paginate or refine the filters when the first page is insufficient. Only products passed to present_products become rendered cards.',
  ].join('\n');
}

function selectedProducts(
  knownProducts: Map<number, ShoppingAssistantProduct>,
  selectedIds: number[],
) {
  const explicit = selectedIds.flatMap((id) => {
    const product = knownProducts.get(id);
    return product ? [product] : [];
  });
  return explicit.length ? explicit : [...knownProducts.values()].slice(0, 3);
}

async function deterministicFallback(
  input: ShoppingAssistantRequest,
  knownProducts: Map<number, ShoppingAssistantProduct>,
  cacheSeconds = 0,
) {
  const lastQuestion =
    [...input.messages].reverse().find((message) => message.role === 'user')?.content ?? '';
  const contextQuery = input.context?.catalogQuery;
  const fallbackQuery = shoppingAssistantCatalogSearchSchema.parse({
    ...(contextQuery ?? {}),
    search: catalogSearchQuery(lastQuestion) || contextQuery?.search || '',
    page: 1,
    limit: 5,
  });
  const searched = lastQuestion
    ? await searchPublicCatalog(fallbackQuery, cacheSeconds).catch(() => null)
    : null;
  const products = searched?.products.length
    ? searched.products
    : [...knownProducts.values()].slice(0, 5);
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
  settings = { ...defaultStorefrontSettingsResponse, ...settings };
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: 'assistant_rate_limited' },
      { status: 429, headers: shoppingAssistantRateLimitHeaders(rateLimit) },
    );
  }
  if (!settings.aiAssistantEnabled) {
    return NextResponse.json({ error: 'assistant_disabled' }, { status: 404 });
  }

  const parsed = shoppingAssistantRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_assistant_request' }, { status: 400 });
  }

  const knownProducts = new Map<number, ShoppingAssistantProduct>();
  const selectedIds: number[] = [];
  const encoder = new TextEncoder();
  const generationAbort = new AbortController();
  const abortGeneration = () => generationAbort.abort();
  request.signal.addEventListener('abort', abortGeneration, { once: true });
  const responseStream = new ReadableStream<Uint8Array>({
    cancel() {
      generationAbort.abort();
    },
    start(controller) {
      const write = (event: ShoppingAssistantStreamEvent) => {
        if (generationAbort.signal.aborted) return;
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
          const grounding = await loadRequestGrounding(parsed.data);
          grounding.knownProducts.forEach((product) => remember(knownProducts, product));
          const config = getStorefrontAiConfig(settings);
          const primaryModel = resolveAiModel(config, 'storefront');
          const modelCandidates = [primaryModel, settings.aiFallbackModel]
            .filter((model): model is string => Boolean(model?.trim()))
            .filter((model, index, models) => models.indexOf(model) === index);
          modelName = primaryModel;
          let generationError: unknown;

          for (const candidateModel of modelCandidates) {
            try {
              modelName = candidateModel;
              selectedIds.splice(0);
              const result = streamText({
                model: createAiLanguageModel(config, 'storefront', { model: candidateModel }),
                instructions: shoppingAssistantInstructions(parsed.data.locale),
                prompt: groundedPrompt(parsed.data, grounding),
                abortSignal: AbortSignal.any([
                  generationAbort.signal,
                  AbortSignal.timeout(config.requestTimeoutMs),
                ]),
                maxRetries: config.maxRetries,
                stopWhen: stepCountIs(8),
                tools: {
                  search_catalog: tool({
                    description:
                      'Search and paginate the complete live public catalog with the same filters available on the catalog page. The result includes the full matching total and whether another page exists.',
                    inputSchema: shoppingAssistantCatalogSearchSchema,
                    execute: async (input) => {
                      toolCallCount += 1;
                      const result = await searchPublicCatalog(input, CATALOG_CACHE_SECONDS);
                      result.products.forEach((product) => remember(knownProducts, product));
                      return result;
                    },
                  }),
                  inspect_products: tool({
                    description:
                      'Inspect up to four public products by ID or slug before detailed questions or comparisons.',
                    inputSchema: shoppingAssistantProductLookupSchema,
                    execute: async ({ tokens }) => {
                      toolCallCount += 1;
                      const productCards = await loadProductCards().catch(() => new Map());
                      const products = (
                        await Promise.all(
                          tokens.map((token) => fetchStorefrontProductDetail(token)),
                        )
                      )
                        .filter((product) => product !== null)
                        .map((product) =>
                          toAssistantDetailProduct(product.item, productCards.get(product.item.id)),
                        );
                      products.forEach((product) => remember(knownProducts, product));
                      return { products };
                    },
                  }),
                  present_products: tool({
                    description:
                      'Select only the grounded products that should be rendered as recommendation cards with this answer.',
                    inputSchema: shoppingAssistantProductSelectionSchema,
                    execute: async ({ productIds }) => {
                      toolCallCount += 1;
                      const accepted = productIds.filter((id) => knownProducts.has(id));
                      selectedIds.splice(0, selectedIds.length, ...new Set(accepted));
                      return {
                        selectedProducts: selectedProducts(knownProducts, selectedIds).map(
                          conciseProduct,
                        ),
                        rejectedProductIds: productIds.filter((id) => !knownProducts.has(id)),
                      };
                    },
                  }),
                },
              });

              for await (const part of result.stream) {
                if (part.type === 'tool-call') {
                  write({ type: 'status', status: 'catalog' });
                  const name = shoppingAssistantToolNameSchema.safeParse(part.toolName);
                  if (name.success) write({ type: 'tool', name: name.data, status: 'started' });
                }
                if (part.type === 'tool-result' || part.type === 'tool-error') {
                  const name = shoppingAssistantToolNameSchema.safeParse(part.toolName);
                  if (name.success)
                    write({
                      type: 'tool',
                      name: name.data,
                      status: part.type === 'tool-result' ? 'completed' : 'failed',
                    });
                }
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
              generationError = undefined;
              break;
            } catch (error) {
              if (generationAbort.signal.aborted) throw error;
              generationError = error;
              if (emittedText) throw error;
            }
          }
          if (generationError) throw generationError;

          if (!emittedText.trim()) {
            const fallback = await deterministicFallback(
              parsed.data,
              knownProducts,
              CATALOG_CACHE_SECONDS,
            );
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
              resultsCount: fallback.products.length,
              conversation: parsed.data.messages,
              response: fallback.message,
              promptVersion: STOREFRONT_AI_PROMPT_VERSION,
            }).catch(() => {});
            return;
          }

          const products = selectedProducts(knownProducts, selectedIds);
          const finalResult = shoppingAssistantResponseSchema.parse({
            mode: 'ai',
            message: emittedText,
            products,
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
            resultsCount: finalResult.products.length,
            conversation: parsed.data.messages,
            response: finalResult.message,
            promptVersion: STOREFRONT_AI_PROMPT_VERSION,
          }).catch(() => {});
        } catch {
          if (generationAbort.signal.aborted) {
            void recordStorefrontAssistantRun({
              telemetry: parsed.data.telemetry,
              locale: parsed.data.locale,
              status: 'cancelled',
              mode: 'ai',
              model: modelName,
              ...usage,
              durationMs: Date.now() - startedAt,
              toolCalls: toolCallCount,
              resultsCount: selectedProducts(knownProducts, selectedIds).length,
              conversation: parsed.data.messages,
              response: emittedText,
              promptVersion: STOREFRONT_AI_PROMPT_VERSION,
            }).catch(() => {});
            return;
          }
          if (emittedText) {
            void recordStorefrontAssistantRun({
              telemetry: parsed.data.telemetry,
              locale: parsed.data.locale,
              status: 'failed',
              mode: 'fallback',
              model: modelName,
              ...usage,
              durationMs: Date.now() - startedAt,
              toolCalls: toolCallCount,
              resultsCount: 0,
              conversation: parsed.data.messages,
              response: emittedText,
              promptVersion: STOREFRONT_AI_PROMPT_VERSION,
            }).catch(() => {});
            write({ type: 'error', code: 'assistant_unavailable' });
            return;
          }
          const fallback = await deterministicFallback(
            parsed.data,
            knownProducts,
            CATALOG_CACHE_SECONDS,
          ).catch(() => null);
          void recordStorefrontAssistantRun({
            telemetry: parsed.data.telemetry,
            locale: parsed.data.locale,
            status: 'failed',
            mode: 'fallback',
            model: modelName,
            ...usage,
            durationMs: Date.now() - startedAt,
            toolCalls: toolCallCount,
            resultsCount: fallback?.products.length ?? 0,
            conversation: parsed.data.messages,
            response: fallback?.message ?? '',
            promptVersion: STOREFRONT_AI_PROMPT_VERSION,
          }).catch(() => {});
          if (!fallback) {
            write({ type: 'error', code: 'assistant_unavailable' });
            return;
          }
          write({ type: 'text-delta', delta: fallback.message });
          write({ type: 'result', mode: fallback.mode, products: fallback.products });
        } finally {
          request.signal.removeEventListener('abort', abortGeneration);
          if (!generationAbort.signal.aborted) controller.close();
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
