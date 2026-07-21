import { createAiLanguageModel, getAiConfig } from '@bric/ai-core';
import { generateText, stepCountIs, tool } from 'ai';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { fetchLegacyProductByToken, fetchLegacyProductsPage } from '@/lib/storefront-api';
import { shopperAssistantInstructions, toShopperProduct } from '@/lib/storefront-ai';
import { enforceStorefrontAiRateLimit, storefrontAiRateLimitHeaders } from '@/lib/storefront-ai-rate-limit';

const requestSchema = z.object({
  locale: z.enum(['fr', 'ar']).default('fr'),
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(1_500) })).min(1).max(8),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceStorefrontAiRateLimit(request);
    if (!rateLimit.ok) return NextResponse.json({ error: 'Too many assistant requests. Please try again shortly.' }, { status: 429, headers: storefrontAiRateLimitHeaders(rateLimit) });
  } catch {
    return NextResponse.json({ error: 'Shopping assistant is unavailable right now.' }, { status: 503 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid shopping-assistant request.' }, { status: 400 });

  try {
    const config = getAiConfig();
    const result = await generateText({
      model: createAiLanguageModel(config, 'storefront'),
      instructions: shopperAssistantInstructions(parsed.data.locale),
      prompt: parsed.data.messages.map((message) => `${message.role === 'user' ? 'Shopper' : 'Assistant'}: ${message.content}`).join('\n'),
      stopWhen: stepCountIs(4),
      tools: {
        search_catalog: tool({
          description: 'Search the public Bricomaitre catalog. Use this before making a recommendation or product claim.',
          inputSchema: z.object({ query: z.string().trim().min(1).max(160), category: z.string().trim().max(120).optional(), brand: z.string().trim().max(120).optional(), inStockOnly: z.boolean().default(true), limit: z.number().int().min(1).max(8).default(5) }),
          execute: async ({ query, category, brand, inStockOnly, limit }) => {
            const page = await fetchLegacyProductsPage({ search: query, category, brand, instock: inStockOnly, limit, sortby: '-updatedAt' });
            return { products: page.products.map(toShopperProduct), count: page.pagination.totalCount ?? page.products.length };
          },
        }),
        get_product: tool({
          description: 'Read one public catalog product by its ID or slug before comparing it or answering detailed questions.',
          inputSchema: z.object({ token: z.string().trim().min(1).max(200) }),
          execute: async ({ token }) => {
            const product = await fetchLegacyProductByToken(token);
            return product ? { product: toShopperProduct(product) } : { product: null, message: 'Product not found.' };
          },
        }),
      },
    });
    return NextResponse.json({ message: result.text, toolResults: result.toolResults });
  } catch (error) {
    if (error instanceof Error && (error.message === 'AI is disabled' || error.message.includes('is not configured'))) {
      return NextResponse.json({ error: 'Shopping assistant is unavailable right now.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Shopping assistant is unavailable right now.' }, { status: 502 });
  }
}
