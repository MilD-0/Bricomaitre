import {
  compactAiEvalSuiteReport,
  createAiLanguageModel,
  getAiConfig,
  runAiEvalSuite,
  type AiEvalTranscript,
} from '@bric/ai-core';
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';

import { ADMIN_AI_CHAT_INSTRUCTIONS } from '../lib/ai-admin-chat';
import {
  ADMIN_AI_ANALYTICS_INSTRUCTIONS,
  ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT,
} from '../lib/admin-ai-analytics-contract';
import {
  adminAiAnalyticsPlanMessage,
  applyAdminAiAnalyticsQueryPlan,
  planAdminAiAnalyticsQuery,
  type AdminAiAnalyticsQueryPlan,
} from '../lib/admin-ai-analytics-plan';
import {
  ADMIN_AI_ANALYTICS_TOOL_DESCRIPTION,
  adminAiAnalyticsQuerySchema,
} from '../lib/ai-analytics';
import { ADMIN_AI_EVAL_SCENARIOS, type AdminAiEvalInput } from '../lib/ai-eval-scenarios';
import {
  ADMIN_AI_DEFAULT_MODEL,
  ADMIN_AI_MAX_OUTPUT_TOKENS,
  resolveAdminAiModel,
} from '../lib/admin-ai-models';
import {
  adminAiGroundingTool,
  adminAiMutationTool,
  adminAiStepPlan,
} from '../lib/admin-ai-tool-plan';
import { permissionCatalog } from '../lib/permissions';
import type { AiEvalScenario } from '@bric/ai-core/evals';

const descriptions: Record<string, string> = {
  inspect_orders: 'Read complete live order, customer, delivery, product, value, and status data.',
  update_order_status: 'Update exact inspected orders through the canonical order workflow.',
  update_order_details:
    'Correct exact inspected order customer, delivery, address, note, or product-line details.',
  inspect_inventory: 'Read current inventory levels, movements, and low-stock products.',
  adjust_inventory: 'Increase or decrease exact resolved inventory quantities.',
  inspect_assets: 'Read current asset inventory, usage, size, and missing media state.',
  inspect_landing_pages:
    'Read complete current landing-page documents, revisions, publication state, and ordered blocks.',
  create_landing_page:
    'Generate and persist one complete validated landing page for an exact resolved product.',
  edit_landing_page:
    'Apply a staged, revision-safe landing-page edit while preserving unaffected blocks.',
  update_asset_state: 'Activate, deactivate, or place exact inspected merchandising assets.',
  reorder_assets: 'Persist an explicit complete ordering for one inspected asset kind.',
  manage_assets:
    'Create, completely replace, or delete one exact banner, featured group, or product card.',
  inspect_ai_proposals: 'Read the current AI proposal review inbox.',
  review_ai_proposals: 'Approve or reject exact inspected proposals through canonical workflows.',
  inspect_administration: 'Read staff accounts, exact permissions, roles, and access grants.',
  set_access_grant: 'Create or update one exact canonical staff access grant.',
  set_role_definition: 'Create or update one complete custom staff role definition.',
  inspect_storefront_configuration:
    'Read storefront contacts, AI settings, configured models, and bilingual announcement content.',
  update_storefront_announcement:
    'Update the French and Arabic storefront announcement after an explicit operator request.',
  inspect_bulletin: 'Read complete Bulletin posts, replies, attachments, reactions, and authors.',
  create_bulletin_post: 'Create a canonical Bulletin post as the current operator.',
  reply_bulletin_post: 'Reply to one exact inspected Bulletin thread as the current operator.',
  update_bulletin_post:
    'Edit or pin one exact inspected Bulletin post with omitted fields preserved.',
  delete_bulletin_content:
    'Delete one exact inspected Bulletin post or reply through ownership and moderation rules.',
  query_analytics: ADMIN_AI_ANALYTICS_TOOL_DESCRIPTION,
  categorize_catalog: 'Start exactly one resumable full-catalog categorization job.',
  generate_product_content: 'Start one bulk product-content generation job.',
  find_products: 'Resolve product names to current exact product records and IDs.',
  inspect_products:
    'Read complete current product content, identifiers, commercial fields, taxonomy, images, inventory, and promo rules.',
  create_product:
    'Create one exact product through canonical validation, history, inventory, and catalog refresh.',
  update_products:
    'Directly update exact inspected products through canonical merged-record validation.',
  archive_products: 'Archive exact inspected products while retaining historical order references.',
  suggest_discount: 'Create one reviewable product discount proposal.',
  find_brands: 'Resolve current brands by name before taxonomy changes.',
  find_categories: 'Resolve current category names, IDs, and parent hierarchy before changes.',
  manage_taxonomy:
    'Directly create, update, activate, reparent, or delete one exact brand or category.',
  propose_brand_create: 'Create one reviewable inactive brand proposal.',
  list_background_jobs: 'Read current server-owned background job queues and progress.',
  propose_product_edit: 'Create one reviewable product edit proposal.',
};

const fixtureByTool: Record<string, unknown> = {
  find_products: { matches: [{ id: 12, title: 'Perceuse Bosch 18 V', price: '15000.00' }] },
  inspect_products: {
    items: [
      {
        id: 12,
        title: 'Perceuse Bosch 18 V',
        slug: 'perceuse-bosch-18-v',
        sku: 'PB-1',
        price: 15_000,
        purchasePrice: 9_500,
        active: true,
        inStock: true,
        availabilityStatus: 'in_stock',
        inventoryQuantity: 2,
        brandId: 2,
        categoryId: 3,
        images: ['https://cdn.example.com/perceuse.jpg'],
        promoCodes: [],
      },
    ],
    taxonomyMatches: {
      brands: { items: [{ id: 2, name: 'Bosch' }], total: 1 },
      categories: { items: [{ id: 3, name: 'Perceuses' }], total: 1 },
    },
  },
  find_brands: { matches: [] },
  find_categories: {
    items: [{ id: 3, name: 'Perceuses', nameAr: 'مثاقب', parentId: null, isActive: true }],
    total: 1,
  },
  inspect_orders: { orders: [{ id: 91, customer: { name: 'Client Exemple' }, status: 'pending' }] },
  inspect_inventory: { lowStock: [{ productId: 12, quantity: 2 }] },
  inspect_assets: {
    featuredGroups: [
      {
        id: 7,
        name: 'Sélection atelier',
        active: false,
        showAtTopOfProductsPage: false,
        productIds: [12, 18],
      },
    ],
    missing: [{ productId: 12, title: 'Perceuse Bosch 18 V' }],
  },
  inspect_landing_pages: {
    items: [
      {
        id: 41,
        productId: 12,
        productTitle: 'Perceuse Bosch 18 V',
        locale: 'fr',
        slug: 'perceuse-bosch-18-v-41',
        status: 'draft',
        draftRevision: 3,
        document: {
          schemaVersion: 2,
          theme: { accent: 'orange', density: 'comfortable', shell: 'campaign' },
          seo: { title: 'Perceuse Bosch 18 V', description: 'Perceuse pour vos travaux.' },
          blocks: [
            { id: 'hero', type: 'product-hero', heading: 'Perceuse Bosch 18 V' },
            { id: 'benefits', type: 'benefit-grid', heading: 'Les avantages' },
            { id: 'final', type: 'final-cta', heading: 'Commander' },
          ],
        },
      },
    ],
  },
  inspect_ai_proposals: { proposals: [{ id: 44, status: 'proposed' }] },
  inspect_administration: { accessGrants: [{ email: 'operator@example.com', role: 'orders' }] },
  inspect_storefront_configuration: {
    settings: { aiAssistantEnabled: true, aiModel: 'openai/gpt-5.6-luna' },
    announcement: { messageFr: '', messageAr: '', active: false },
  },
  inspect_bulletin: {
    posts: [
      {
        id: 7,
        title: 'Suivi',
        pinned: false,
        permissions: { canEdit: true, canDelete: true, canPin: true },
        replies: [{ id: 9, body: 'Ancienne réponse', permissions: { canDelete: true } }],
      },
    ],
  },
  list_background_jobs: {
    jobs: [{ id: 5, type: 'product_export', status: 'running', progress: 60 }],
  },
};

const genericInputSchema = z.object({}).catchall(z.unknown());

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function analyticsFixtureForScenario(
  scenario: AiEvalScenario<AdminAiEvalInput>,
  inputValue: unknown,
) {
  const input = recordValue(inputValue);
  const view = typeof input.view === 'string' ? input.view : 'command';
  const range = typeof input.range === 'string' ? input.range : '30d';
  const presetStarts: Record<string, string> = {
    '7d': '2026-08-17',
    '14d': '2026-08-10',
    '30d': '2026-07-25',
    '90d': '2026-05-26',
    year: '2026-01-01',
    all: '2025-01-01',
  };
  const startDate =
    range === 'custom' && typeof input.startDate === 'string'
      ? input.startDate
      : (presetStarts[range] ?? '2026-07-25');
  const endDate =
    range === 'custom' && typeof input.endDate === 'string' ? input.endDate : '2026-08-23';
  const requestedRange = { startDate, endDate };
  const economicsRange = { startDate, endDate: '2026-08-17' };
  const acquisitionRange = { startDate, endDate: '2026-08-16' };
  const fulfillmentRange = { startDate, endDate: '2026-08-16' };

  const metric = (
    name: string,
    value: number | null,
    definition: string,
    options: {
      unit?: string;
      sources?: string[];
      effectiveRange?: { startDate: string; endDate: string };
      dateBasis?: string;
      coveragePct?: number | null;
      maturity?: string;
      estimated?: boolean;
      assumptions?: string[];
      warning?: string | null;
      previous?: number | null;
    } = {},
  ) => ({
    key: name,
    name,
    value,
    unit: options.unit ?? 'count',
    definition,
    sources: options.sources ?? ['orders'],
    requestedRange,
    effectiveRange: options.effectiveRange ?? economicsRange,
    dateBasis: options.dateBasis ?? 'Africa/Algiers business date.',
    asOf: (options.effectiveRange ?? economicsRange).endDate,
    coveragePct: options.coveragePct ?? null,
    maturity: options.maturity ?? 'Observed over the declared effective range.',
    estimated: options.estimated ?? false,
    assumptions: options.assumptions ?? [],
    attributionCoveragePct: null,
    comparisonStatus: options.previous == null ? 'not_applicable' : 'comparable',
    warning: options.warning ?? null,
    previous: options.previous ?? null,
  });

  let metrics: Record<string, unknown>[] = [];
  let data: Record<string, unknown> = {};
  let warnings: string[] = [];

  switch (scenario.id) {
    case 'admin-analytics-submitted-is-not-sale':
    case 'admin-analytics-submitted-is-not-sale-ar':
      metrics = [
        metric(
          'submittedOrders',
          128,
          'Incoming storefront orders; submitted demand, not completed sales.',
          {
            dateBasis: 'Order-created date.',
            effectiveRange: { startDate, endDate: '2026-08-19' },
          },
        ),
        metric('deliveredOrders', 79, 'EcoTrack recorded deliveries; delivery is not payment.', {
          sources: ['orders', 'ecotrack'],
          dateBasis: 'EcoTrack delivery event date.',
          effectiveRange: fulfillmentRange,
        }),
        metric(
          'paidOrders',
          61,
          'EcoTrack payed and paye_et_archive outcomes; recognized paid flow.',
          {
            sources: ['orders', 'ecotrack'],
            dateBasis: 'EcoTrack paid/archive recognition date.',
            effectiveRange: fulfillmentRange,
          },
        ),
      ];
      data = { lifecycleSummary: { submittedOrders: 128, deliveredOrders: 79, paidOrders: 61 } };
      break;
    case 'admin-analytics-paid-contribution-vs-true-profit':
      metrics = [
        metric(
          'automaticPaidProfit',
          310_000,
          'EcoTrack COD minus estimated tariff and product cost. This is paid contribution, not whole-business profit.',
          {
            unit: 'dzd',
            sources: ['orders', 'ecotrack'],
            effectiveRange: fulfillmentRange,
            dateBasis: 'EcoTrack paid/archive recognition date.',
            coveragePct: 92,
            estimated: true,
            assumptions: ['30% fallback margin where immutable purchase costs are missing'],
          },
        ),
        metric(
          'trueProfit',
          145_000,
          'Adjusted profit minus comparable Meta ad cost and operating costs; planning-based whole-business true profit.',
          {
            unit: 'dzd',
            sources: ['orders', 'meta', 'assumptions'],
            effectiveRange: economicsRange,
            dateBasis: 'Calculator accounting date led by first-posted orders.',
            coveragePct: 92,
            estimated: true,
          },
        ),
      ];
      data = { paidContributionDzd: 310_000, trueProfitDzd: 145_000 };
      break;
    case 'admin-analytics-observed-return-is-not-planning':
      metrics = [
        metric(
          'planningReturnRate',
          18,
          'Manually configured return rate used by every projection.',
          {
            unit: 'percent',
            sources: ['assumptions'],
            dateBasis: 'Manual assumption effective date.',
          },
        ),
        metric(
          'observedMatureReturnRate',
          24,
          'Returned divided by paid plus returned for mature terminal outcomes; descriptive evidence only.',
          {
            unit: 'percent',
            sources: ['orders', 'ecotrack'],
            effectiveRange: fulfillmentRange,
            dateBasis: 'Original first-posted cohort.',
            maturity: 'Mature terminal cohort of 250 orders.',
          },
        ),
      ];
      data = {
        returns: {
          planningRatePct: 18,
          observedMatureRatePct: 24,
          matureSampleSize: 250,
          adoption: 'Observed does not change planning without an explicit user action.',
        },
      };
      break;
    case 'admin-analytics-common-source-cutoff':
      metrics = [
        metric('costPerPaid', 4_200, 'Comparable Meta cost divided by paid outcomes.', {
          unit: 'dzd',
          sources: ['orders', 'meta', 'ecotrack'],
          effectiveRange: acquisitionRange,
          dateBasis: 'Shared source effective range.',
          warning:
            'Common cross-source coverage ends 2026-08-16. The 2026-08-17 through 2026-08-23 tail is unavailable, not zero.',
        }),
      ];
      data = {
        coverage: {
          requestedThrough: '2026-08-23',
          ordersThrough: '2026-08-19',
          metaThrough: '2026-08-17',
          ecotrackThrough: '2026-08-16',
          commonThrough: '2026-08-16',
          missingTailSemantics: 'unavailable_not_zero',
        },
      };
      warnings = ['Cross-source paid-acquisition claims are comparable only through 2026-08-16.'];
      break;
    case 'admin-analytics-meta-attribution-window':
      metrics = [
        metric('attributedPostedOrders', 26, 'Exactly attributed Bricomaitre posted orders.', {
          sources: ['orders', 'meta'],
          effectiveRange: acquisitionRange,
          dateBasis: 'Captured order-attribution date.',
        }),
      ];
      data = {
        attribution: {
          reconstructedRetainedCoverageBegins: '2026-08-10',
          immutableOrderTimeCaptureBegins: '2026-08-17',
          rule: 'A campaign absent from the ranked table is not proof it did not run.',
        },
      };
      break;
    case 'admin-analytics-modeled-decline':
      metrics = [
        metric('trueProfit', 145_000, 'Observed true profit over the completed effective range.', {
          unit: 'dzd',
          sources: ['orders', 'meta', 'assumptions'],
          effectiveRange: economicsRange,
        }),
      ];
      data = {
        forecastMeaning:
          'Dotted rows are modeled completion/future values; a sharp dotted decline is not an observed business collapse.',
      };
      break;
    case 'admin-analytics-search-position-direction':
      metrics = [
        metric(
          'averagePosition',
          5.2,
          'Impression-weighted Search Console average position. Lower is better.',
          {
            unit: 'position',
            sources: ['searchConsole'],
            effectiveRange: { startDate, endDate: '2026-08-20' },
            dateBasis: 'Search Console finalized reporting date.',
            previous: 8.4,
          },
        ),
      ];
      data = { averagePosition: { current: 5.2, previous: 8.4, lowerIsBetter: true } };
      break;
    case 'admin-analytics-profit-x-zero-spend':
      metrics = [
        metric(
          'profitX',
          null,
          'Adjusted profit divided by Meta ad cost; unavailable when comparable ad cost is zero.',
          {
            unit: 'ratio',
            sources: ['orders', 'meta', 'assumptions'],
            effectiveRange: economicsRange,
            warning:
              'Unavailable because comparable Meta ad cost is zero; it is neither zero nor infinity.',
          },
        ),
        metric('adCost', 0, 'Comparable Meta spend converted to DZD.', {
          unit: 'dzd',
          sources: ['meta', 'assumptions'],
          effectiveRange: economicsRange,
        }),
      ];
      data = { adjustedProfitDzd: 220_000, adCostDzd: 0, profitX: null };
      break;
    case 'admin-analytics-missing-cost-estimation':
      metrics = [
        metric('trueProfit', 145_000, 'Planning-based whole-business true profit.', {
          unit: 'dzd',
          sources: ['orders', 'meta', 'assumptions'],
          effectiveRange: economicsRange,
          coveragePct: 92,
          estimated: true,
          assumptions: ['30% fallback margin for uncovered purchase costs'],
          warning:
            'Exact purchase-cost coverage is 92%; uncovered economics use the canonical 30% estimated margin.',
        }),
      ];
      data = { exactCostCoveragePct: 92, fallbackMarginPct: 30, estimated: true };
      warnings = [
        'The result materially depends on the uncovered 8% and must be described as partly estimated.',
      ];
      break;
    case 'admin-analytics-friday-accounting':
      metrics = [
        metric('adCost', 46_000, 'Actual Meta spend converted with the snapshotted FX rate.', {
          unit: 'dzd',
          sources: ['meta', 'assumptions'],
          effectiveRange: economicsRange,
          dateBasis:
            'Actual Meta reporting date in source totals; Friday rest-day spend rolls only in calculator accounting.',
        }),
      ];
      data = {
        fridayAccounting: {
          friday: '2026-08-21',
          calculatorRollForwardDay: '2026-08-22',
          isRestDay: true,
          actualMetaTimestampChanged: false,
          actualMetaSpendRemainsOnFriday: true,
          scope: 'calculator_accounting_only',
        },
      };
      break;
    case 'admin-analytics-delivery-attempt-telemetry':
      metrics = [
        metric('deliveredOrders', 79, 'EcoTrack recorded deliveries.', {
          sources: ['orders', 'ecotrack'],
          effectiveRange: fulfillmentRange,
          dateBasis: 'EcoTrack delivery event date.',
        }),
      ];
      data = {
        attemptTelemetry: {
          deliveredOrderId: 91,
          recordedAttempts: 0,
          interpretation:
            'EcoTrack did not supply attempt telemetry; zero recorded attempts does not prove no attempt occurred.',
        },
      };
      break;
    default:
      metrics = [
        metric('postedOrders', 24, 'Orders on their first transition to local status 11.', {
          effectiveRange: fulfillmentRange,
          dateBasis: 'First-posted date.',
        }),
      ];
      data = { summary: { postedOrders: 24 } };
  }

  const focusInput = recordValue(input.focus);
  const focusDimension =
    typeof focusInput.dimension === 'string' ? focusInput.dimension : undefined;
  const focusRowsByScenario: Record<string, Record<string, unknown>[]> = {
    'admin-analytics-product-focus': [
      {
        id: '12',
        title: 'Perceuse Bosch 18 V',
        postedUnits: 24,
        paidUnits: 18,
        projectedContributionDzd: 125_000,
      },
    ],
    'admin-analytics-meta-attribution-window': [
      {
        id: 'campaign-alpha',
        name: 'Campagne Alpha',
        spendEur: 420,
        exactlyAttributedOrders: 26,
        attributionSpendCoveragePct: 61,
      },
    ],
    'admin-analytics-modeled-decline': [
      { day: '2026-08-23', trueProfitDzd: 34_000, modeled: false },
      { day: '2026-08-24', trueProfitDzd: 28_000, modeled: true },
      { day: '2026-08-25', trueProfitDzd: 14_000, modeled: true },
      { day: '2026-08-26', trueProfitDzd: 4_000, modeled: true },
    ],
    'admin-analytics-search-position-direction': [
      { day: '2026-08-01', averagePosition: 8.4 },
      { day: '2026-08-20', averagePosition: 5.2 },
    ],
    'admin-analytics-friday-accounting': [
      {
        weekStart: '2026-08-21',
        fridayMetaSpendDzd: 46_000,
        calculatorRollForwardDay: '2026-08-22',
        actualTimestampChanged: false,
      },
    ],
    'admin-analytics-delivery-attempt-telemetry': [
      { outcome: 'delivered', orders: 1, recordedAttempts: 0, telemetryAvailable: false },
    ],
  };
  const focusRows = focusRowsByScenario[scenario.id] ?? [];
  const focus = focusDimension
    ? {
        ...focusInput,
        definition: `Canonical ${focusDimension} dataset for the ${view} workspace.`,
        dateBasis: metrics[0]?.dateBasis ?? 'Owning Analytics workspace date basis.',
        totalSemantics:
          'Rows are a ranked or temporal decision view; missing rows are not proof of business absence.',
        effectiveRanges: [
          view === 'acquisition'
            ? { key: 'acquisition', ...acquisitionRange }
            : view === 'fulfillment'
              ? { key: 'fulfillment', ...fulfillmentRange }
              : { key: 'economics', ...economicsRange },
        ],
        available: scenario.id === 'admin-analytics-product-focus' ? 75 : focusRows.length,
        matched: focusRows.length,
        included: focusRows.length,
        rows: focusRows,
      }
    : null;

  return {
    kind: 'analytics2',
    responseContractVersion: 1,
    semanticContract: ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT,
    query: view,
    view,
    filters: {
      view,
      range,
      startDate,
      endDate,
      grain: input.grain ?? 'auto',
    },
    effectiveRanges: [
      { key: 'economics', ...economicsRange, sources: ['orders', 'meta', 'assumptions'] },
      { key: 'acquisition', ...acquisitionRange, sources: ['orders', 'meta', 'ecotrack'] },
      { key: 'fulfillment', ...fulfillmentRange, sources: ['orders', 'ecotrack'] },
    ],
    metrics,
    focus,
    generatedAt: '2026-08-23T12:00:00.000Z',
    referenceDate: '2026-08-23',
    data: focus ? { kind: view, metrics, focus } : { kind: view, metrics, ...data },
    sources: [
      { key: 'orders', state: 'current', throughDate: '2026-08-19', coveragePct: 100 },
      { key: 'meta', state: 'partial', throughDate: '2026-08-17', coveragePct: 80 },
      { key: 'ecotrack', state: 'partial', throughDate: '2026-08-16', coveragePct: 76 },
      { key: 'assumptions', state: 'manual', throughDate: null, coveragePct: 92 },
      {
        key: 'searchConsole',
        state: 'partial',
        throughDate: '2026-08-20',
        coveragePct: 87,
      },
    ],
    warnings,
    truncations: [],
  };
}

function toolsForScenario(
  scenario: AiEvalScenario<AdminAiEvalInput>,
  analyticsPlan: AdminAiAnalyticsQueryPlan | null,
) {
  let analyticsQueryExecutionCount = 0;
  return Object.fromEntries(
    Object.entries(descriptions).map(([name, description]) => [
      name,
      tool({
        description,
        inputSchema: name === 'query_analytics' ? adminAiAnalyticsQuerySchema : genericInputSchema,
        execute: async (input) =>
          name === 'query_analytics'
            ? analyticsFixtureForScenario(
                scenario,
                adminAiAnalyticsQuerySchema.parse(
                  analyticsPlan && analyticsQueryExecutionCount++ === 0
                    ? applyAdminAiAnalyticsQueryPlan(input, analyticsPlan)
                    : input,
                ),
              )
            : (fixtureByTool[name] ?? { status: 'proposed', id: 100 }),
      }),
    ]),
  );
}

async function executeScenario(
  scenario: AiEvalScenario<AdminAiEvalInput>,
): Promise<AiEvalTranscript> {
  const config = getAiConfig();
  const selectedModel = resolveAdminAiModel(ADMIN_AI_DEFAULT_MODEL, 'medium');
  const [surface, section] = scenario.input.surface.split('/', 2);
  const groundingTool = adminAiGroundingTool({
    message: scenario.input.message,
    surface,
    section,
    permissions: permissionCatalog,
  });
  const mutationTool = adminAiMutationTool({
    message: scenario.input.message,
    surface,
    section,
    permissions: permissionCatalog,
  });
  const analyticsPlan =
    groundingTool === 'query_analytics'
      ? planAdminAiAnalyticsQuery({
          message: scenario.input.message,
          now: new Date('2026-08-23T12:00:00.000Z'),
        })
      : null;
  const tools = toolsForScenario(scenario, analyticsPlan);
  const requestedEvalTimeout = Number(process.env.AI_EVAL_TIMEOUT_MS ?? 60_000);
  const evalTimeout =
    Number.isFinite(requestedEvalTimeout) && requestedEvalTimeout > 0
      ? requestedEvalTimeout
      : 60_000;
  const result = await generateText({
    model: createAiLanguageModel(config, 'admin', {
      model: selectedModel.model,
      openRouterRequestBody: selectedModel.openRouterRequestBody,
    }),
    instructions:
      surface === 'analytics' || surface === 'stats'
        ? `${ADMIN_AI_CHAT_INSTRUCTIONS} ${ADMIN_AI_ANALYTICS_INSTRUCTIONS}`
        : ADMIN_AI_CHAT_INSTRUCTIONS,
    prompt: [
      `Current admin surface: ${surface}${section ? `/${section}` : ''}`,
      ...(analyticsPlan ? [adminAiAnalyticsPlanMessage(analyticsPlan)] : []),
      `Operator: ${scenario.input.message}`,
    ].join('\n'),
    tools,
    stopWhen: stepCountIs(8),
    prepareStep: ({ stepNumber, steps = [] }) => {
      const analyticsQueryCount = steps.reduce(
        (count, step) =>
          count + step.toolCalls.filter((call) => call?.toolName === 'query_analytics').length,
        0,
      );
      const plan = adminAiStepPlan({
        stepNumber,
        groundingTool,
        mutationTool,
        analyticsQueryCount,
        analyticsQueryLimit: analyticsPlan?.maxQueries,
      });
      if (plan?.kind === 'force_tool') {
        return {
          activeTools: [plan.toolName],
          toolChoice: { type: 'tool', toolName: plan.toolName },
        };
      }
      if (plan?.kind === 'analytics_only') {
        return { activeTools: ['query_analytics'], toolChoice: 'auto' };
      }
      if (plan?.kind === 'answer_only') return { activeTools: [], toolChoice: 'none' };
      return undefined;
    },
    maxRetries: config.maxRetries,
    maxOutputTokens: ADMIN_AI_MAX_OUTPUT_TOKENS,
    timeout: Math.max(config.requestTimeoutMs, evalTimeout),
  });
  const steps = await result.steps;
  const transcript: AiEvalTranscript = {
    status: 'completed',
    answer: await result.text,
    toolCalls: steps.flatMap((step) =>
      step.toolCalls.map((call) => ({
        name: call.toolName,
        status: 'completed' as const,
        input: call.input,
      })),
    ),
  };
  if (process.env.AI_EVAL_TRACE === 'true') {
    console.error(
      JSON.stringify(
        {
          scenarioId: scenario.id,
          answer: transcript.answer,
          toolCalls: transcript.toolCalls,
        },
        null,
        2,
      ),
    );
  }
  return transcript;
}

async function main() {
  const pattern = process.env.AI_EVAL_SCENARIO_PATTERN?.trim();
  const scenarios = pattern
    ? ADMIN_AI_EVAL_SCENARIOS.filter((scenario) => new RegExp(pattern, 'i').test(scenario.id))
    : [...ADMIN_AI_EVAL_SCENARIOS];
  if (scenarios.length === 0) throw new Error(`No AI eval scenarios matched ${pattern}.`);
  const report = await runAiEvalSuite({
    scenarios,
    execute: executeScenario,
    concurrency: Number(process.env.AI_EVAL_CONCURRENCY ?? 1),
  });

  const output = process.env.AI_EVAL_VERBOSE === 'true' ? report : compactAiEvalSuiteReport(report);
  console.log(JSON.stringify(output, null, 2));
  const threshold = Number(process.env.AI_EVAL_PASS_RATE ?? 0.85);
  if (report.passRate < threshold) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
