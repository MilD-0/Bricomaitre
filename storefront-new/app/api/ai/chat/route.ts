import { createOpenAiResponsesModel, getAiConfig } from '@bric/ai-core';
import {
  shoppingAssistantCatalogSearchSchema,
  shoppingAssistantProductLookupSchema,
  shoppingAssistantRequestSchema,
  shoppingAssistantResponseSchema,
  type ShoppingAssistantProduct,
  type ShoppingAssistantRequest,
} from '@bric/storefront-core/shopping-assistant-contracts';
import { generateText, stepCountIs, tool } from 'ai';
import { NextRequest, NextResponse } from 'next/server';

import {
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
    .map((product) => toAssistantCatalogProduct(product, {
      brand: product.brandId ? brandNames.get(product.brandId) ?? null : null,
      category: product.categoryId ? categoryNames.get(product.categoryId) ?? null : null,
    }));
}

function remember(products: ShoppingAssistantProduct[], product: ShoppingAssistantProduct | null) {
  if (!product) return;
  const existingIndex = products.findIndex((item) => item.id === product.id);
  if (existingIndex >= 0) products.splice(existingIndex, 1);
  products.push(product);
  if (products.length > 8) products.splice(0, products.length - 8);
}

function conversationPrompt(input: ShoppingAssistantRequest) {
  return input.messages.map((message) => `${message.role === 'user' ? 'Customer' : 'Advisor'}: ${message.content}`).join('\n');
}

async function deterministicFallback(input: ShoppingAssistantRequest, remembered: ShoppingAssistantProduct[]) {
  let products = [...remembered];
  if (!products.length) {
    const lastQuestion = [...input.messages].reverse().find((message) => message.role === 'user')?.content ?? '';
    if (lastQuestion) {
      products = await searchPublicCatalog({ query: lastQuestion.slice(0, 160), inStockOnly: true, limit: 5 }).catch(() => []);
    }
  }
  return shoppingAssistantResponseSchema.parse({
    mode: 'fallback',
    message: deterministicAssistantMessage(input.locale, products.length),
    products,
  });
}

export async function POST(request: NextRequest) {
  let rateLimit;
  try {
    rateLimit = await enforceShoppingAssistantRateLimit(request);
  } catch {
    return NextResponse.json({ error: 'assistant_unavailable' }, { status: 503 });
  }
  if (!rateLimit.ok) {
    return NextResponse.json({ error: 'assistant_rate_limited' }, {
      status: 429,
      headers: shoppingAssistantRateLimitHeaders(rateLimit),
    });
  }

  const settings = await getStorefrontSettings().catch(() => defaultStorefrontSettingsResponse);
  if (!settings.aiAssistantEnabled) {
    return NextResponse.json({ error: 'assistant_disabled' }, { status: 404 });
  }

  const parsed = shoppingAssistantRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_assistant_request' }, { status: 400 });
  const remembered: ShoppingAssistantProduct[] = [];

  try {
    const config = getAiConfig();
    const result = await generateText({
      model: createOpenAiResponsesModel(config, 'storefront'),
      instructions: shoppingAssistantInstructions(parsed.data.locale),
      prompt: conversationPrompt(parsed.data),
      abortSignal: AbortSignal.timeout(config.requestTimeoutMs),
      maxRetries: config.maxRetries,
      stopWhen: stepCountIs(5),
      tools: {
        search_catalog: tool({
          description: 'Search the live public Bricomaitre catalog before recommending products.',
          inputSchema: shoppingAssistantCatalogSearchSchema,
          execute: async (input) => {
            const products = await searchPublicCatalog(input);
            products.forEach((product) => remember(remembered, product));
            return { products, count: products.length };
          },
        }),
        inspect_products: tool({
          description: 'Inspect up to four public products by ID or slug before answering detailed questions or comparisons.',
          inputSchema: shoppingAssistantProductLookupSchema,
          execute: async ({ tokens }) => {
            const products = (await Promise.all(tokens.map((token) => fetchStorefrontProductDetail(token))))
              .filter((product) => product !== null)
              .map((product) => toAssistantDetailProduct(product.item));
            products.forEach((product) => remember(remembered, product));
            return { products };
          },
        }),
      },
    });
    if (!result.text.trim()) return NextResponse.json(await deterministicFallback(parsed.data, remembered));
    return NextResponse.json(shoppingAssistantResponseSchema.parse({
      mode: 'ai',
      message: result.text,
      products: remembered,
    }));
  } catch {
    return NextResponse.json(await deterministicFallback(parsed.data, remembered));
  }
}
