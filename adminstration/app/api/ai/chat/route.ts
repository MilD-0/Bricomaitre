import { createOpenAiResponsesModel, getAiConfig, productContentFieldSchema, semanticAnalyticsComparisonSchema, semanticAnalyticsQuerySchema } from '@bric/ai-core';
import { generateText, stepCountIs, tool } from 'ai';
import { and, eq, ilike, or } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getDb, hasDb } from '../../../../db/client';
import { products } from '../../../../db/schema';
import { proposeProductContent } from '../../../../lib/ai-product-content';
import { proposeBundle, proposeDiscount, proposeEntityEdit, proposeFeaturedProducts, proposeLandingPage } from '../../../../lib/ai-admin-capabilities';
import { executeSemanticAnalytics, executeSemanticAnalyticsComparison } from '../../../../lib/ai-semantic-analytics';
import { startAiContentJob } from '../../../../lib/background-jobs';
import { auth } from '../../../../lib/auth';
import { canViewProfitStats, hasPermission, normalizePermissions } from '../../../../lib/permissions';
import { requireAiUseAccess } from '../../../../lib/rbac';

const requestSchema = z.object({ message: z.string().trim().min(1).max(4_000) });

export async function POST(request: NextRequest) {
  const denied = await requireAiUseAccess();
  if (denied) return denied;
  if (!hasDb()) return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid AI chat request.' }, { status: 400 });

  try {
    const session = await auth();
    const actor = { email: session?.user?.email, name: session?.user?.name };
    const permissions = normalizePermissions(session?.user?.permissions);
    const db = getDb();
    const config = getAiConfig();
    const result = await generateText({
      model: createOpenAiResponsesModel(config, 'admin'),
      instructions: [
        'You are the Bricomaitre admin catalog assistant.',
        'For product content requests, resolve product IDs with find_products, then call generate_product_content.',
        'Never claim that proposals are already applied. Generated content always requires admin review.',
        'Use scope all_missing only when the user clearly asks for every/all products missing content.',
        'If a product name is ambiguous, show matches and ask the user to clarify instead of generating.',
        'Use only the allowlisted analytics tool; never invent or request raw SQL.',
        'For database questions, choose the narrowest semantic query and report its date range, metric definitions, source, and caveats. Do not combine values with incompatible definitions.',
        'Use sales_summary for imported fulfilled-order economics and order_summary for submitted storefront orders. Do not describe one as the other.',
        'Discounts, bundles, featured groups, and edits are reviewable proposals and are never already applied.',
        'Landing pages use only registered typed blocks. Never generate runtime JavaScript, JSX, CSS, unsupported product claims, fake scarcity, or fabricated testimonials.',
        'The default minimum gross margin is 15%. A user may explicitly override it for one request; clearly warn when below the default.',
      ].join(' '),
      prompt: parsed.data.message,
      stopWhen: stepCountIs(6),
      tools: {
        find_products: tool({
          description: 'Find active products by title or SKU before performing a catalog action.',
          inputSchema: z.object({ query: z.string().trim().min(1).max(200), limit: z.number().int().min(1).max(20).default(10) }),
          execute: async ({ query, limit }) => db.select({ id: products.id, title: products.title, sku: products.sku })
            .from(products)
            .where(and(eq(products.active, true), or(ilike(products.title, `%${query}%`), ilike(products.sku, `%${query}%`))))
            .limit(limit),
        }),
        ...(hasPermission(permissions, 'ai_catalog_propose') ? { generate_product_content: tool({
          description: 'Create reviewable product-content proposals for explicit products or every active product missing requested fields. Does not apply changes.',
          inputSchema: z.object({
            scope: z.enum(['explicit', 'all_missing']),
            productIds: z.array(z.number().int().positive()).max(100).default([]),
            fields: z.array(productContentFieldSchema).min(1),
            context: z.string().trim().max(2_000).optional(),
          }),
          execute: async ({ scope, productIds, fields, context }) => {
            if (scope === 'explicit' && productIds.length === 0) return { error: 'At least one resolved product is required.' };
            if (scope === 'explicit' && productIds.length <= 5) {
              const proposals = [];
              for (const productId of productIds) {
                proposals.push(await proposeProductContent({ productId, fields, adminContext: context, actorId: actor.email }));
              }
              return { kind: 'proposals', proposals };
            }
            const started = await startAiContentJob(actor.email ?? 'unknown-admin', {
              productIds: scope === 'all_missing' ? null : productIds,
              fields,
              onlyMissing: scope === 'all_missing',
              context,
              actor,
            });
            return started;
          },
        }) } : {}),
        ...(hasPermission(permissions, 'ai_analytics_query') ? { query_analytics: tool({
          description: 'Run one read-only semantic analytics query over catalog, sales, orders, funnel, product/category/brand performance, inventory, promotions, bundles, or content gaps. Dates use YYYY-MM-DD. Raw SQL is never accepted.',
          inputSchema: semanticAnalyticsQuerySchema,
          execute: (input) => executeSemanticAnalytics(input, { canViewProfit: canViewProfitStats(session?.user?.role) }),
        }), compare_analytics_periods: tool({
          description: 'Compare two explicit, bounded date periods for sales, submitted orders, storefront funnel, or promotion performance. Returns current, previous, and calculated deltas. Raw SQL is never accepted.',
          inputSchema: semanticAnalyticsComparisonSchema,
          execute: (input) => executeSemanticAnalyticsComparison(input, { canViewProfit: canViewProfitStats(session?.user?.role) }),
        }) } : {}),
        ...(hasPermission(permissions, 'ai_pricing_analyze') ? {
          suggest_discount: tool({
            description: 'Create a reviewable margin-safe product discount proposal.',
            inputSchema: z.object({ productId: z.number().int().positive(), percentOff: z.number().positive().max(90), minimumMargin: z.number().min(0).max(0.95).optional() }),
            execute: (input) => proposeDiscount({ ...input, actorId: actor.email }),
          }),
          suggest_bundle: tool({
            description: 'Create a reviewable proposal for a new inactive bundle product listing.',
            inputSchema: z.object({ title: z.string().trim().min(1).max(240), titleAr: z.string().trim().max(240).optional(), components: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().positive().max(100) })).min(2).max(30), minimumMargin: z.number().min(0).max(0.95).optional() }),
            execute: (input) => proposeBundle({ ...input, actorId: actor.email }),
          }),
        } : {}),
        ...(hasPermission(permissions, 'ai_catalog_propose') ? { suggest_featured_products: tool({
          description: 'Create a reviewable inactive featured product group using deterministic performance ranking.',
          inputSchema: z.object({ name: z.string().trim().min(1).max(120), limit: z.number().int().min(1).max(30).default(8) }),
          execute: (input) => proposeFeaturedProducts({ ...input, actorId: actor.email }),
        }) } : {}),
        ...(hasPermission(permissions, 'ai_catalog_propose') ? { suggest_landing_page: tool({
          description: 'Create a distinct, conversion-focused and reviewable landing-page draft grounded in verified product data and registered performance-bounded blocks. Price, stock, assets, and technical claims remain protected.',
          inputSchema: z.object({ productId: z.number().int().positive(), locale: z.enum(['fr', 'ar']), campaignAngle: z.string().trim().max(2_000).optional() }),
          execute: (input) => proposeLandingPage({ ...input, actorId: actor.email }),
        }) } : {}),
        ...(hasPermission(permissions, 'ai_catalog_propose') ? { propose_entity_edit: tool({
          description: 'Propose restricted field edits to a product, brand, or category. Never directly applies them.',
          inputSchema: z.object({ entityType: z.enum(['products', 'brands', 'categories']), entityId: z.number().int().positive(), changes: z.record(z.string(), z.unknown()) }),
          execute: (input) => proposeEntityEdit({ ...input, actorId: actor.email }),
        }) } : {}),
      },
    });
    return NextResponse.json({ message: result.text, toolResults: result.toolResults });
  } catch (error) {
    if (error instanceof Error && (error.message === 'AI is disabled' || error.message.includes('is not configured'))) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Admin AI chat failed.' }, { status: 502 });
  }
}
