import { z } from 'zod';

import type { AiStatsMetric, AiStatsPayload, AiStatsSurface } from './ai-stats';
import { aiStatsQuerySchema, getAiStatsData } from './ai-stats';
import { adminAiDateScopeSchema, canonicalAdminAiDateQuery } from './admin-ai-date-scope';

type AiStatsMetricDefinition = {
  definition: string;
  dateBasis: string;
  denominator?: string;
  exclusions?: string[];
};

const ADMIN_AI_STATS_METRIC_DEFINITIONS: Record<
  AiStatsSurface,
  Record<string, AiStatsMetricDefinition>
> = {
  operations: {
    interactiveRequests: {
      definition: 'Admin assistant runs whose task is admin_chat.',
      dateBasis: 'Run start time in Africa/Algiers.',
    },
    responseCompletion: {
      definition:
        'Completed interactive admin-assistant runs divided by completed plus failed runs.',
      denominator: 'Completed plus failed runs.',
      exclusions: ['Running and cancelled runs are excluded from the rate denominator.'],
      dateBasis: 'Run start time in Africa/Algiers.',
    },
    toolCompletion: {
      definition: 'Completed tool calls divided by all recorded admin-chat tool calls.',
      denominator: 'All recorded tool calls attached to admin_chat runs in the selected period.',
      dateBasis: 'Tool-call start time in Africa/Algiers.',
    },
    p95Latency: {
      definition:
        'The duration at or below which 95% of valid interactive admin-assistant run samples finished.',
      denominator: 'Runs with a completion time at or after their start time.',
      dateBasis: 'Run start time in Africa/Algiers.',
    },
    helpfulRatings: {
      definition: 'Helpful ratings divided by all helpful plus not-helpful ratings.',
      denominator: 'Rated assistant answers only, not all answers.',
      dateBasis: 'Assistant-message creation time in Africa/Algiers.',
    },
    costPerCompletion: {
      definition:
        'Estimated model cost for interactive admin-chat runs divided by completed interactive runs.',
      denominator: 'Completed interactive runs.',
      exclusions: [
        'Unavailable model pricing makes the estimate unavailable rather than zero.',
        'This is model usage cost, not labor, infrastructure, or whole-business operating cost.',
      ],
      dateBasis: 'Run start time in Africa/Algiers.',
    },
  },
  shopping: {
    engagedJourneys: {
      definition:
        'Storefront assistant questions/messages in the period. Despite the historical metric key, this is not a distinct-journey count.',
      dateBasis: 'Storefront assistant event time in Africa/Algiers.',
    },
    resultClickRate: {
      definition: 'Storefront assistant result-click events divided by assistant message events.',
      denominator: 'Assistant messages/questions in the selected period.',
      dateBasis: 'Storefront assistant event time in Africa/Algiers.',
    },
    recommendedOrders: {
      definition:
        'Orders whose immutable assistant-influence record says a recommended product was ordered.',
      dateBasis: 'Order-created date, with the captured influence record attached to the order.',
    },
    confirmedAssisted: {
      definition:
        'Assistant-engaged orders that later reached one of Bricomaitre’s recognized successful local order statuses.',
      dateBasis: 'Order-created cohort with later local status observed.',
      exclusions: ['Opening the assistant alone is not assisted-order engagement.'],
    },
    paidAssisted: {
      definition: 'Assistant-engaged orders that later reached EcoTrack payed or paye_et_archive.',
      dateBasis: 'Order-created cohort with later EcoTrack paid outcome observed.',
      exclusions: ['Delivered but not paid orders are excluded.'],
    },
    paidContribution: {
      definition:
        'Automatic paid contribution attached to paid assisted orders: EcoTrack COD minus estimated tariff and product cost. It is not whole-business true profit.',
      dateBasis: 'Order-created assistant-influence cohort with later paid contribution observed.',
      exclusions: [
        'Meta advertising and configured operating costs are not deducted.',
        'Orders without a usable automatic-paid contribution remain outside the covered contribution amount and are reported through contribution coverage.',
      ],
    },
    paidContributionCoverage: {
      definition:
        'Share of paid assistant-influenced orders with a usable automatic-paid contribution fact.',
      denominator: 'All paid assistant-influenced orders in the selected order-created cohort.',
      dateBasis: 'Order-created assistant-influence cohort with later paid outcome observed.',
      exclusions: ['This is evidence coverage, not the share of whole-business profit attributed.'],
    },
  },
};

export const ADMIN_AI_STATS_SEMANTIC_CONTRACT = {
  operations: {
    population:
      'Headline operations metrics use interactive admin_chat runs. Workflow rows can also include deterministic and batch admin work, so workflow totals are not interchangeable with the interactive headline.',
    workloadModes:
      'admin_chat is interactive; a model name beginning with deterministic is deterministic work; other registered admin AI work is batch.',
    completion:
      'Response completion uses completed divided by completed plus failed. Cancelled and still-running work is shown separately and excluded from that rate.',
    tools:
      'Tool reliability is tool-call evidence attached to admin_chat runs. A completed response and completed tool call are different outcomes.',
    ratings:
      'Helpful rate describes rated answers only. Always state its rating sample; unrated answers are not silently negative or positive.',
    latency:
      'P95 latency uses only valid non-negative duration samples. It is a tail-latency percentile, not an average.',
    cost: 'Cost is an estimate from recorded token usage and configured model pricing. Coverage reports how much of the run population had usable pricing; missing pricing is unavailable, not free usage.',
    releases:
      'Release rows group prompt version and model. They support comparison but do not by themselves prove that a prompt or model caused an outcome.',
  },
  shopping: {
    eventPopulation:
      'Opens, questions, result clicks, runs, feedback, and latency come from Storefront assistant telemetry on their event dates.',
    orderPopulation:
      'Assisted-order metrics use orders created in the selected period with immutable assistant-influence evidence, then observe later local and EcoTrack outcomes.',
    influence:
      'An assistant open alone is exposure, not an assisted order. Assisted engagement begins at engaged, recommendation_clicked, or recommended_product_ordered.',
    journey:
      'Journey stages mix event counts and order-cohort outcomes and are therefore an operational progression, not one person-level conversion funnel with a common denominator.',
    paid: 'Confirmed assisted is a local status outcome; paid assisted requires EcoTrack payed or paye_et_archive. Delivery alone is not payment.',
    contribution:
      'Paid contribution is automatic paid contribution for covered paid assisted orders, not revenue, cash balance, net profit, or true profit. State contribution coverage when it is below 100%.',
    resultClicks:
      'Result-click rate is result-click events divided by questions/messages; it is not the share of distinct shoppers who clicked.',
  },
  availability:
    'The returned coverage dates describe the available underlying run or event records in the selected range. A missing tail, null rate, missing pricing, or absent outcome is unavailable—not zero.',
} as const;

export const ADMIN_AI_STATS_TOOL_DESCRIPTION =
  'Read the canonical AI Stats workspaces. Operations covers the Admin assistant; shopping owns Storefront-assistant-influenced order counts and their paid contribution. Date scopes distinguish rolling periods from explicit calendar bounds. Results include metric definitions, samples, date bases, and coverage.';

export const adminAiStatsQuerySchema = z
  .object({
    surface: z.enum(['operations', 'shopping']).default('operations'),
    date: adminAiDateScopeSchema,
    grain: z.enum(['auto', 'day', 'week', 'month']).default('auto'),
  })
  .strict();

export type AdminAiStatsMetric = AiStatsMetric &
  AiStatsMetricDefinition & {
    name: string;
    sample: number | null;
    nullMeaning: string;
  };

function aiStatsMetricsForAssistant(payload: AiStatsPayload): AdminAiStatsMetric[] {
  const definitions = ADMIN_AI_STATS_METRIC_DEFINITIONS[payload.surface];
  return payload.data.metrics.map((metric) => {
    const definition = definitions[metric.key] ?? {
      definition: `Canonical ${metric.key} metric from the ${payload.surface} AI Stats workspace.`,
      dateBasis: 'The date basis declared by the owning AI Stats workspace.',
    };
    return {
      ...metric,
      name: metric.key,
      sample: metric.sample ?? null,
      ...definition,
      nullMeaning:
        'Unavailable because the denominator, valid samples, contribution coverage, or pricing evidence is absent; never interpret null as zero.',
    };
  });
}

export function compactAiStatsForAssistant(payload: AiStatsPayload) {
  const metrics = aiStatsMetricsForAssistant(payload);
  const data = Object.fromEntries(
    Object.entries(payload.data).filter(([key]) => key !== 'metrics'),
  );
  return {
    kind: 'ai_stats' as const,
    responseContractVersion: 4 as const,
    surface: payload.surface,
    filters: payload.filters,
    coverage: payload.coverage,
    metrics,
    data,
    generatedAt: payload.generatedAt,
    referenceDate: payload.referenceDate,
    reviewClock: payload.reviewClock,
    diagnostics: payload.diagnostics,
  };
}

export async function queryAdminAiStats(raw: unknown) {
  const { date, ...options } = adminAiStatsQuerySchema.parse(raw);
  const query = aiStatsQuerySchema.parse({ ...options, ...canonicalAdminAiDateQuery(date) });
  return compactAiStatsForAssistant(await getAiStatsData(query));
}
