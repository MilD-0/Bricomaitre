import 'dotenv/config';

// Usage: pnpm --filter @bric/storefront eval:ai [suite] [scenario]
// This exercises the real read tools. Cart changes remain simulated and are never written.

import { assertAiConfigured, createAiLanguageModel, getAiConfig } from '@bric/ai-core';
import { defaultStorefrontSettingsResponse } from '@bric/storefront-core/contracts';
import type { ShoppingAssistantRequest } from '@bric/storefront-core/shopping-assistant-contracts';
import { generateText, stepCountIs } from 'ai';

import {
  STOREFRONT_ASSISTANT_MAX_OUTPUT_TOKENS,
  shoppingAssistantInstructions,
  shoppingAssistantModelMessages,
} from '../lib/shopping-assistant-runtime';
import { buildShoppingAssistantTools } from '../lib/shopping-assistant-tools';
import { fetchStorefrontSettings } from '../lib/storefront-api';

type Scenario = {
  id: string;
  locale: 'fr' | 'ar';
  turns: string[];
  cartItems?: Array<{ productId: number; quantity: number }>;
  pathname?: string;
  currentProductToken?: string;
  currentLandingPageSlug?: string;
  currentOrderToken?: string;
  requiredEnv?: string[];
};

const suites: Record<string, Scenario[]> = {
  shopping: [
    {
      id: 'french_concrete_recommendation',
      locale: 'fr',
      turns: [
        'Je cherche une perceuse pour de petits travaux à la maison. Propose-moi les meilleures options disponibles sans me noyer dans les détails.',
        'Laquelle est la moins chère, et qu’est-ce que je perds par rapport à ton premier choix ?',
      ],
    },
    {
      id: 'uncertain_compatibility',
      locale: 'fr',
      turns: [
        'Trouve-moi un disque compatible avec une meuleuse Bosch de 115 mm. Vérifie ce que tu peux réellement confirmer.',
      ],
    },
    {
      id: 'arabic_recommendation',
      locale: 'ar',
      turns: ['نحتاج أداة بسيطة للاستعمال المنزلي لثقب الحائط. اقترح لي خيارات متوفرة وباختصار.'],
    },
    {
      id: 'current_product_page',
      locale: 'fr',
      pathname: '/fr/products/worcraft-perceuse-a-percussion-13mm-600w-id-600',
      currentProductToken: 'worcraft-perceuse-a-percussion-13mm-600w-id-600',
      turns: [
        'Je suis sur cette fiche. Est-ce un bon choix pour percer occasionnellement du béton à la maison ?',
      ],
    },
    {
      id: 'current_landing_page',
      locale: 'fr',
      pathname: `/fr/landing/${process.env.STOREFRONT_AI_EVAL_LANDING_SLUG ?? ''}`,
      currentLandingPageSlug: process.env.STOREFRONT_AI_EVAL_LANDING_SLUG,
      requiredEnv: ['STOREFRONT_AI_EVAL_LANDING_SLUG'],
      turns: ['Résume-moi cette offre et dis-moi à qui le produit convient.'],
    },
  ],
  support: [
    {
      id: 'ordering_workflow',
      locale: 'fr',
      turns: ["J'ai passé une commande. Qu'est-ce qui se passe maintenant ?"],
    },
    {
      id: 'delivery_bab_ezzouar',
      locale: 'fr',
      turns: ['Livrez-vous à Bab Ezzouar, et combien coûte la livraison à domicile et en bureau ?'],
    },
    {
      id: 'unlinked_order_arabic',
      locale: 'ar',
      turns: ['أين وصلت طلبيتي؟'],
    },
    {
      id: 'linked_order',
      locale: 'fr',
      pathname: '/fr/thank-you',
      currentOrderToken: process.env.STOREFRONT_AI_EVAL_ORDER_TOKEN,
      requiredEnv: ['STOREFRONT_AI_EVAL_ORDER_TOKEN'],
      turns: ['Où en est ma commande et quelle est la prochaine étape utile ?'],
    },
    {
      id: 'promotion_validation',
      locale: 'fr',
      turns: ['Est-ce que le code EVAL-NOT-A-CODE fonctionne sur le produit 243 ?'],
    },
  ],
  cart: [
    {
      id: 'recommend_then_add',
      locale: 'fr',
      turns: [
        'Trouve-moi une perceuse disponible et pas trop chère.',
        'Ajoute ton meilleur choix au panier.',
      ],
    },
    {
      id: 'update_then_remove',
      locale: 'fr',
      cartItems: [{ productId: 243, quantity: 1 }],
      turns: ['Passe cette perceuse à trois exemplaires.', 'Finalement, retire-la du panier.'],
    },
  ],
};

function compact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[nested value omitted]';
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 499)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 8).map((item) => compact(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        compact(child, depth + 1),
      ]),
    );
  }
  return value;
}

function toolEvidence(result: {
  steps: ReadonlyArray<{
    toolResults: ReadonlyArray<{ toolName: string; input: unknown; output: unknown }>;
  }>;
}) {
  return result.steps.flatMap((step) =>
    step.toolResults.map(({ toolName, input, output }) => ({
      toolName,
      input,
      output: compact(output),
    })),
  );
}

async function runScenario(
  scenario: Scenario,
  settings: Awaited<ReturnType<typeof fetchStorefrontSettings>>,
) {
  const history: ShoppingAssistantRequest['messages'] = [];
  let cartItems = scenario.cartItems ?? [];

  for (let turn = 0; turn < scenario.turns.length; turn += 1) {
    const prompt = scenario.turns[turn];
    const request: ShoppingAssistantRequest = {
      locale: scenario.locale,
      messages: [...history, { role: 'user', content: prompt }],
      context: {
        pathname: scenario.pathname ?? `/${scenario.locale}`,
        currentProductToken: scenario.currentProductToken ?? null,
        currentLandingPageSlug: scenario.currentLandingPageSlug ?? null,
        currentOrderToken: scenario.currentOrderToken ?? null,
        catalogQuery: null,
        cartItems,
      },
    };
    const runtime = buildShoppingAssistantTools({ request, settings });
    const startedAt = Date.now();
    const result = await generateText({
      model: createAiLanguageModel(getAiConfig(), 'storefront', { model: settings.aiModel }),
      instructions: shoppingAssistantInstructions(scenario.locale),
      messages: shoppingAssistantModelMessages(request),
      tools: runtime.tools,
      toolChoice: 'auto',
      stopWhen: stepCountIs(12),
      maxOutputTokens: STOREFRONT_ASSISTANT_MAX_OUTPUT_TOKENS,
    });
    const final = runtime.result();
    for (const mutation of final.cartMutations) {
      const productId = mutation.action === 'add' ? mutation.product.id : mutation.productId;
      cartItems = cartItems.filter((item) => item.productId !== productId);
      if (mutation.quantity > 0) cartItems.push({ productId, quantity: mutation.quantity });
    }

    console.log(
      JSON.stringify({
        suite: process.argv[2] || 'all',
        scenario: scenario.id,
        turn: turn + 1,
        prompt,
        durationMs: Date.now() - startedAt,
        finishReason: result.finishReason,
        usage: result.totalUsage,
        evidence: toolEvidence(result),
        selectedProducts: final.products.map((product) => ({
          id: product.id,
          title: product.title,
        })),
        cartMutations: compact(final.cartMutations),
        answer: result.text,
      }),
    );

    history.push(
      { role: 'user', content: prompt },
      {
        role: 'assistant',
        content: result.text,
        ...(final.products.length
          ? { productIds: final.products.map((product) => product.id) }
          : {}),
      },
    );
  }
}

async function main() {
  const config = getAiConfig();
  assertAiConfigured(config);
  if (config.provider !== 'openrouter')
    throw new Error('Storefront evaluation requires OpenRouter.');

  const suite = process.argv[2];
  if (suite && !(suite in suites)) {
    throw new Error(`Choose one suite: ${Object.keys(suites).join(', ')}`);
  }
  const scenarioId = process.argv[3];
  const selected = (suite ? suites[suite] : Object.values(suites).flat()).filter(
    (scenario) => !scenarioId || scenario.id === scenarioId,
  );
  if (selected.length === 0) throw new Error(`Unknown scenario: ${scenarioId}`);

  const settings = await fetchStorefrontSettings().catch(() => defaultStorefrontSettingsResponse);
  for (const scenario of selected) {
    const missingEnv = (scenario.requiredEnv ?? []).filter((name) => !process.env[name]);
    if (missingEnv.length > 0) {
      if (scenarioId) throw new Error(`Missing evaluator environment: ${missingEnv.join(', ')}`);
      console.log(JSON.stringify({ scenario: scenario.id, skipped: true, missingEnv }));
      continue;
    }
    await runScenario(scenario, settings);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exitCode = 1;
});
