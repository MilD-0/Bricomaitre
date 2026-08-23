import {
  createAiLanguageModel,
  getAiConfig,
  runAiEvalSuite,
  type AiEvalTranscript,
} from '@bric/ai-core';
import {
  shoppingAssistantCatalogSearchSchema,
  shoppingAssistantProductLookupSchema,
  shoppingAssistantProductSelectionSchema,
} from '@bric/storefront-core/shopping-assistant-contracts';
import { generateText, stepCountIs, tool } from 'ai';

import {
  SHOPPING_ASSISTANT_EVAL_SCENARIOS,
  type ShoppingAssistantEvalInput,
} from '../lib/shopping-assistant-eval-scenarios';
import { shoppingAssistantInstructions } from '../lib/shopping-assistant';
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

const tools = {
  search_catalog: tool({
    description: 'Search and paginate the complete live public catalog with its full filters.',
    inputSchema: shoppingAssistantCatalogSearchSchema,
    execute: async (input) => ({
      products,
      total: products.length,
      page: input.page,
      hasMore: false,
    }),
  }),
  inspect_products: tool({
    description: 'Inspect public product details before comparisons or detailed answers.',
    inputSchema: shoppingAssistantProductLookupSchema,
    execute: async () => ({ products }),
  }),
  present_products: tool({
    description: 'Select grounded products to render as recommendation cards.',
    inputSchema: shoppingAssistantProductSelectionSchema,
    execute: async ({ productIds }) => ({ selectedProductIds: productIds }),
  }),
};

function contextFor(kind: ShoppingAssistantEvalInput['context']) {
  if (kind === 'product')
    return { pathname: '/fr/products/perceuse-bosch-18v', currentProduct: products[0] };
  if (kind === 'cart' || kind === 'checkout')
    return { pathname: `/${kind}`, cart: products.map((product) => ({ quantity: 1, product })) };
  return { pathname: '/fr/products', currentCatalogPage: { products, total: 1043, hasMore: true } };
}

async function executeScenario(
  scenario: AiEvalScenario<ShoppingAssistantEvalInput>,
): Promise<AiEvalTranscript> {
  const config = getAiConfig();
  const result = await generateText({
    model: createAiLanguageModel(config, 'storefront'),
    instructions: shoppingAssistantInstructions(scenario.locale),
    prompt: `${scenario.input.message}\n\nVerified application context:\n${JSON.stringify(contextFor(scenario.input.context))}`,
    tools,
    stopWhen: stepCountIs(6),
    maxRetries: config.maxRetries,
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
}

const report = await runAiEvalSuite({
  scenarios: [...SHOPPING_ASSISTANT_EVAL_SCENARIOS],
  execute: executeScenario,
  concurrency: Number(process.env.AI_EVAL_CONCURRENCY ?? 2),
});

console.log(JSON.stringify(report, null, 2));
const threshold = Number(process.env.AI_EVAL_PASS_RATE ?? 0.85);
if (report.passRate < threshold) process.exitCode = 1;
