import {
  createAiLanguageModel,
  getAiConfig,
  resolveAiModel,
  runAiEvalSuite,
  type AiEvalTranscript,
} from '@bric/ai-core';
import {
  shoppingAssistantCatalogSearchSchema,
  shoppingAssistantOrderLookupSchema,
  shoppingAssistantProductLookupSchema,
  shoppingAssistantProductSelectionSchema,
} from '@bric/storefront-core/shopping-assistant-contracts';
import { generateText, stepCountIs, tool } from 'ai';

import {
  SHOPPING_ASSISTANT_EVAL_SCENARIOS,
  type ShoppingAssistantEvalInput,
} from '../lib/shopping-assistant-eval-scenarios';
import {
  shoppingAssistantInstructions,
  shoppingAssistantToolPlan,
  STOREFRONT_AI_CAPABILITY_FALLBACK_MODEL,
  STOREFRONT_AI_MAX_OUTPUT_TOKENS,
} from '../lib/shopping-assistant';
import type { AiEvalScenario } from '@bric/ai-core/evals';

const products = [
  {
    id: 12,
    token: 'perceuse-bosch-18v',
    title: 'Perceuse Bosch 18 V',
    titleAr: 'مثقاب بوش 18 فولت',
    description: 'Perceuse sans fil pour les travaux courants.',
    descriptionAr: 'مثقاب لاسلكي للأعمال المعتادة.',
    price: '15000.00',
    oldPrice: null,
    inStock: true,
    availabilityStatus: 'in_stock',
    imageUrl: null,
    brand: 'Bosch',
    category: 'Perceuses',
  },
  {
    id: 18,
    token: 'perceuse-compacte',
    title: 'Perceuse compacte',
    titleAr: 'مثقاب مدمج',
    description: 'Alternative compacte pour les petits travaux.',
    descriptionAr: 'بديل مدمج للأعمال الصغيرة.',
    price: '9900.00',
    oldPrice: null,
    inStock: true,
    availabilityStatus: 'in_stock',
    imageUrl: null,
    brand: 'Bric Pro',
    category: 'Perceuses',
  },
];

function createTools(
  onGroundingResult: (productCount: number) => void,
  options: { noCatalogMatch: boolean },
) {
  return {
    search_catalog: tool({
      description: 'Search and paginate the complete live public catalog with its full filters.',
      inputSchema: shoppingAssistantCatalogSearchSchema,
      execute: async (input) => {
        const matches = options.noCatalogMatch ? [] : products;
        onGroundingResult(matches.length);
        return {
          products: matches,
          total: matches.length,
          page: input.page,
          hasMore: false,
        };
      },
    }),
    inspect_order: tool({
      description: 'Refresh the order linked to the current confirmation journey.',
      inputSchema: shoppingAssistantOrderLookupSchema,
      execute: async () => ({
        id: 84,
        status: 7,
        statusLabel: 'قيد التوصيل',
        updatedAt: '2026-08-23T12:00:00.000Z',
        city: 'Alger',
        totalAmount: 18_000,
        products: [{ title: 'Perceuse Bosch 18 V', quantity: 1 }],
      }),
    }),
    inspect_products: tool({
      description: 'Inspect public product details before comparisons or detailed answers.',
      inputSchema: shoppingAssistantProductLookupSchema,
      execute: async () => {
        onGroundingResult(products.length);
        return { products };
      },
    }),
    present_products: tool({
      description: 'Select grounded products to render as recommendation cards.',
      inputSchema: shoppingAssistantProductSelectionSchema,
      execute: async ({ productIds }) => ({ selectedProductIds: productIds }),
    }),
  };
}

function contextFor(kind: ShoppingAssistantEvalInput['context']) {
  if (kind === 'product')
    return { pathname: '/fr/products/perceuse-bosch-18v', currentProduct: products[0] };
  if (kind === 'landing')
    return {
      pathname: '/fr/landing/perceuse-bosch-18v',
      currentProduct: products[0],
      campaign: { heading: 'Percez le béton efficacement', benefits: ['18 V', 'Sans fil'] },
    };
  if (kind === 'thank-you')
    return {
      pathname: '/ar/thank-you',
      currentOrder: {
        id: 84,
        status: 7,
        statusLabel: 'قيد التوصيل',
        updatedAt: '2026-08-23T12:00:00.000Z',
      },
    };
  if (kind === 'cart' || kind === 'checkout')
    return { pathname: `/${kind}`, cart: products.map((product) => ({ quantity: 1, product })) };
  return { pathname: '/fr/products', currentCatalogPage: { products, total: 1043, hasMore: true } };
}

async function executeScenario(
  scenario: AiEvalScenario<ShoppingAssistantEvalInput>,
): Promise<AiEvalTranscript> {
  const config = getAiConfig();
  const modelCandidates = [
    resolveAiModel(config, 'storefront'),
    process.env.AI_STOREFRONT_FALLBACK_MODEL,
    STOREFRONT_AI_CAPABILITY_FALLBACK_MODEL,
  ]
    .map((model) => model?.trim())
    .filter((model): model is string => Boolean(model))
    .filter((model, index, candidates) => candidates.indexOf(model) === index);
  const toolPlan = shoppingAssistantToolPlan(scenario.input.message, {
    hasInspectableProducts: scenario.input.context !== 'catalog',
    hasOrder: scenario.input.context === 'thank-you',
  });
  const failures: string[] = [];

  for (const model of modelCandidates) {
    let groundingResultCount = 0;
    try {
      const result = await generateText({
        model: createAiLanguageModel(config, 'storefront', { model }),
        instructions: shoppingAssistantInstructions(scenario.locale),
        prompt: `${scenario.input.message}\n\nVerified application context:\n${JSON.stringify(contextFor(scenario.input.context))}`,
        tools: createTools(
          (productCount) => {
            groundingResultCount = productCount;
          },
          { noCatalogMatch: scenario.id === 'storefront-ar-no-match' },
        ),
        prepareStep: ({ stepNumber }) => {
          if (stepNumber === 0 && toolPlan.groundingTool) {
            return {
              activeTools: [toolPlan.groundingTool],
              toolChoice: { type: 'tool', toolName: toolPlan.groundingTool },
            };
          }
          if (stepNumber === 1 && toolPlan.presentProducts && groundingResultCount > 0) {
            return {
              activeTools: ['present_products'],
              toolChoice: { type: 'tool', toolName: 'present_products' },
            };
          }
          return undefined;
        },
        stopWhen: stepCountIs(6),
        maxRetries: config.maxRetries,
        maxOutputTokens: STOREFRONT_AI_MAX_OUTPUT_TOKENS,
        timeout: config.requestTimeoutMs,
      });
      const steps = await result.steps;
      const toolCalls = steps.flatMap((step) => step.toolCalls);
      const renderedEntityIds = toolCalls.flatMap((call) => {
        if (call.toolName !== 'present_products') return [];
        const selection = shoppingAssistantProductSelectionSchema.safeParse(call.input);
        return selection.success ? selection.data.productIds : [];
      });
      return {
        status: 'completed',
        answer: await result.text,
        toolCalls: toolCalls.map((call) => ({ name: call.toolName, status: 'completed' })),
        renderedEntityIds,
      };
    } catch (error) {
      failures.push(`${model}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`All storefront eval models failed (${failures.join('; ')})`);
}

async function main() {
  const report = await runAiEvalSuite({
    scenarios: [...SHOPPING_ASSISTANT_EVAL_SCENARIOS],
    execute: executeScenario,
    concurrency: Number(process.env.AI_EVAL_CONCURRENCY ?? 1),
  });

  console.log(JSON.stringify(report, null, 2));
  const threshold = Number(process.env.AI_EVAL_PASS_RATE ?? 0.85);
  if (report.passRate < threshold) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
