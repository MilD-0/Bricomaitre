import { z } from 'zod';

import {
  analytics2QuerySchema,
  getAnalytics2Data,
  type Analytics2Payload,
  type Analytics2Query,
} from './analytics2';
import {
  ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT,
  analyticsMetricsForAssistant,
  type AdminAiAnalyticsMetric,
} from './admin-ai-analytics-contract';
import {
  adminAiAnalyticsFocusSchema,
  adminAiAnalyticsFocusSupportsSelectors,
  focusAnalytics2ForAssistant,
  validateAdminAiAnalyticsFocus,
  type AdminAiAnalyticsFocus,
} from './admin-ai-analytics-focus';
import type { AdminAiAnalyticsQueryPlan } from './admin-ai-analytics-plan';

const ADMIN_AI_ANALYTICS_ARRAY_LIMIT = 20;
const ADMIN_AI_ANALYTICS_STRING_LIMIT = 2_000;
const ADMIN_AI_ANALYTICS_MAX_DEPTH = 10;

export const ADMIN_AI_ANALYTICS_TOOL_DESCRIPTION =
  'Read the application-planned canonical Analytics evidence with Bricomaitre semantics version 5. One tool call normally returns one workspace; an application-owned comparison or diagnostic plan can retrieve up to three explicitly named canonical workspaces in parallel and return an analytics_investigation bundle. The model must still call this tool exactly once and must not browse workspaces itself. Command is the executive cross-section; money owns profit meanings, paid contribution, Profit ×, forecasts, posting cohorts, and Friday calculator accounting; acquisition owns Meta entities, attribution, creative diagnostics, tracking, and paid efficiency; fulfillment owns order/shipment lifecycle, attempts, cohorts, and pending-demand forecasts; storefront owns the complete first-party surface including trend, distinct-session funnel, retained paths, onsite searches, product interest, sources, web vitals, landing pages, and assistant usage; search owns Search Console visibility and index health; catalog owns product, basket, customer, and geography decisions; assumptions owns planning returns, FX, costs, and daily overrides. Explicit dates require range custom plus exact startDate and endDate. Exact datasets require the compatible focus.dimension in this same first call. The result contains semantic definitions, field- and row-level contracts, view summary, requested/effective ranges, cutoffs, comparison reasons, maturity, estimation, attribution coverage, and up to 100 focused rows plus related entity series. Interpret every focused column through fieldContract, every stage row through rowContract when present, and every headline through its enriched metric metadata. Call once, then answer from that result; do not issue exploratory follow-up queries or substitute conventional ecommerce meanings. Raw SQL is never accepted.';

type AnalyticsTruncation = {
  path: string;
  available: number;
  included: number;
};

export function analyticsAnswerRequirements(
  metrics: readonly AdminAiAnalyticsMetric[],
  focus?: { dimension: string } | null,
) {
  const names = new Set(metrics.map((metric) => metric.name));
  const requirements: string[] = [];
  const add = (value: string) => {
    if (!requirements.includes(value)) requirements.push(value);
  };

  if (
    metrics.some(
      (metric) =>
        metric.name === 'profitX' && metric.value == null && metric.warning?.includes('zero'),
    )
  ) {
    add(
      'Explicitly say Profit × is unavailable because comparable Meta cost is zero—neither zero nor infinity.',
    );
  }
  if (
    metrics.some(
      (metric) => metric.estimated && metric.coveragePct != null && metric.coveragePct < 100,
    )
  ) {
    add(
      'Explicitly call the result partly estimated and state exact-cost coverage plus the 30% fallback margin.',
    );
  }
  if (focus?.dimension === 'friday_weeks') {
    add(
      'Explicitly say real Meta spend stays recorded on Friday and no real timestamp moves; only calculator economics roll forward.',
    );
  }
  if (focus?.dimension === 'storefront_funnel') {
    add(
      'Explicitly say every funnel stage counts distinct sessions, not raw events, and submitted-order sessions are demand rather than paid sales.',
    );
  }
  if (focus?.dimension === 'forecast') {
    add('Explicitly label dotted values as modeled and not an observed business decline.');
  }
  if (focus?.dimension === 'attempt_outcomes') {
    add(
      'Zero recorded attempts means missing EcoTrack attempt telemetry, not proof that no attempt occurred.',
    );
  }
  if (focus?.dimension === 'search_index_issues') {
    add('An index issue does not establish that organic traffic is zero.');
  }
  if (focus?.dimension === 'meta_daily') {
    add(
      'Explicitly call Meta creative metrics diagnostic correlations and not proof of causality.',
    );
  }
  if (focus?.dimension === 'paid_funnel') {
    add(
      'Interpret every funnel stage through rowContract: Meta exposure, submitted Bricomaitre demand, and later paid outcomes use different sources and date bases and are never interchangeable.',
    );
  }
  if (focus?.dimension === 'cash_pipeline') {
    add(
      'Interpret every cash-pipeline stage through rowContract: submitted and confirmed are pending demand, delivered is not paid, and only the declared paid outcome represents the paid stage.',
    );
  }
  if (
    focus?.dimension === 'campaigns' ||
    focus?.dimension === 'adsets' ||
    focus?.dimension === 'ads'
  ) {
    add(
      'State exact Meta attribution coverage boundaries and never infer that absent rows did not run.',
    );
  }
  if (names.has('planningReturnRate') && names.has('observedMatureReturnRate')) {
    add(
      'Explicitly distinguish the planning rate from the mature observed rate; observed evidence changes planning only after explicit adoption.',
    );
  }
  if (names.has('submittedOrders') && names.has('paidOrders')) {
    add(
      'Explicitly call submitted orders incoming demand rather than completed sales and keep delivered and paid outcomes separate.',
    );
  }
  if (names.has('automaticPaidProfit') && names.has('trueProfit')) {
    add('Explicitly distinguish automatic paid contribution from whole-business true profit.');
  }
  if (names.has('averagePosition')) {
    add('Explicitly say a lower Search Console average-position number is better.');
  }
  if (
    metrics.some(
      (metric) =>
        metric.requestedRange.endDate !== metric.effectiveRange.endDate ||
        metric.requestedRange.startDate !== metric.effectiveRange.startDate,
    )
  ) {
    add(
      'State the requested range and the shorter effective range; unavailable source tails are not zero.',
    );
  }
  return requirements;
}

function compactValue(
  value: unknown,
  path: string,
  depth: number,
  truncations: AnalyticsTruncation[],
  arrayLimit = ADMIN_AI_ANALYTICS_ARRAY_LIMIT,
): unknown {
  if (depth > ADMIN_AI_ANALYTICS_MAX_DEPTH) return '[nested data omitted]';
  if (typeof value === 'string') {
    return value.length <= ADMIN_AI_ANALYTICS_STRING_LIMIT
      ? value
      : `${value.slice(0, ADMIN_AI_ANALYTICS_STRING_LIMIT - 1)}…`;
  }
  if (Array.isArray(value)) {
    if (value.length > arrayLimit) {
      truncations.push({
        path,
        available: value.length,
        included: arrayLimit,
      });
    }
    return value
      .slice(0, arrayLimit)
      .map((item, index) =>
        compactValue(item, `${path}[${index}]`, depth + 1, truncations, arrayLimit),
      );
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        compactValue(child, `${path}.${key}`, depth + 1, truncations, arrayLimit),
      ]),
    );
  }
  return value;
}

export function compactAnalytics2ForAssistant(
  payload: Analytics2Payload,
  focus?: AdminAiAnalyticsFocus,
) {
  const truncations: AnalyticsTruncation[] = [];
  const metrics = analyticsMetricsForAssistant(payload);
  const focusedDataset = focus ? focusAnalytics2ForAssistant(payload, focus) : null;
  const answerRequirements = analyticsAnswerRequirements(metrics, focus);
  const summary =
    payload.data && typeof payload.data === 'object' && 'summary' in payload.data
      ? payload.data.summary
      : null;
  const assistantData = focusedDataset
    ? { kind: payload.view, metrics, summary, focus: focusedDataset }
    : payload.data;
  const compactedData = compactValue(
    assistantData,
    'data',
    0,
    truncations,
    focus?.limit ?? ADMIN_AI_ANALYTICS_ARRAY_LIMIT,
  );
  if (compactedData && typeof compactedData === 'object' && !Array.isArray(compactedData)) {
    (compactedData as Record<string, unknown>).metrics = metrics;
  }
  return {
    kind: 'analytics2' as const,
    responseContractVersion: 4 as const,
    semanticContract: ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT,
    answerRequirements,
    // Kept as a string for the current generic tool-result card. `view` is authoritative.
    query: payload.view,
    view: payload.view,
    filters: payload.filters,
    effectiveRanges: payload.effectiveRanges,
    metrics,
    focus: focusedDataset,
    generatedAt: payload.generatedAt,
    referenceDate: payload.referenceDate,
    reviewClock: payload.reviewClock,
    data: compactedData,
    sources: payload.sources,
    warnings: payload.warnings,
    truncations,
    diagnostics: payload.diagnostics,
  };
}

export const adminAiAnalyticsQuerySchema = analytics2QuerySchema
  .safeExtend({ focus: adminAiAnalyticsFocusSchema.optional() })
  .superRefine((value, context) => {
    const error = validateAdminAiAnalyticsFocus(value.view, value.focus);
    if (error) context.addIssue({ code: 'custom', message: error, path: ['focus', 'dimension'] });
  });

export function adminAiAnalyticsQuerySchemaForPlan(plan: AdminAiAnalyticsQueryPlan | null) {
  if (!plan || plan.maxQueries > 1) return adminAiAnalyticsQuerySchema;
  return z
    .object({
      view: z.literal(plan.view),
      range: z.literal(plan.range),
      ...(plan.startDate ? { startDate: z.literal(plan.startDate) } : {}),
      ...(plan.endDate ? { endDate: z.literal(plan.endDate) } : {}),
      grain: z.enum(['auto', 'day', 'week', 'month']).default(plan.grain ?? 'auto'),
      ...(plan.focus
        ? {
            focus: z
              .object({
                dimension: z.literal(plan.focus.dimension),
                ...(adminAiAnalyticsFocusSupportsSelectors(plan.focus.dimension)
                  ? {
                      search: z.string().trim().min(1).max(200).optional(),
                      identifiers: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
                    }
                  : {}),
                limit: z
                  .number()
                  .int()
                  .min(1)
                  .max(100)
                  .default(plan.focus.limit ?? 20),
              })
              .strict(),
          }
        : {}),
    })
    .strict();
}

export async function queryAdminAnalytics(raw: unknown) {
  const { focus, ...rawQuery } = adminAiAnalyticsQuerySchema.parse(raw);
  const query = analytics2QuerySchema.parse(rawQuery) as Analytics2Query;
  return compactAnalytics2ForAssistant(
    await getAnalytics2Data(query, { includeStorefrontDetails: query.view === 'storefront' }),
    focus,
  );
}

type AdminAnalyticsResult = {
  filters: { startDate?: string | null; endDate?: string | null };
  effectiveRanges: Array<{
    key: string;
    startDate?: string | null;
    endDate?: string | null;
  }>;
  [key: string]: unknown;
};
type AdminAnalyticsLoader = (raw: unknown) => Promise<AdminAnalyticsResult>;

const investigationRangeKeys: Record<Analytics2Payload['view'], string> = {
  command: 'economics',
  money: 'economics',
  acquisition: 'acquisition',
  fulfillment: 'fulfillment',
  storefront: 'storefront',
  search: 'search',
  catalog: 'catalog',
  assumptions: 'assumptions',
};

function investigationEffectiveRange(
  result: AdminAnalyticsResult,
  view: Analytics2Payload['view'],
) {
  const key = investigationRangeKeys[view];
  return result.effectiveRanges.find((range) => range.key === key) ?? null;
}

export async function queryAdminAnalyticsInvestigation(
  rawQueries: readonly unknown[],
  reason: string,
  load: AdminAnalyticsLoader = queryAdminAnalytics,
) {
  const queries = z.array(adminAiAnalyticsQuerySchema).min(1).max(3).parse(rawQueries);
  const initialResults = await Promise.all(queries.map((query) => load(query)));
  if (initialResults.length === 1) return initialResults[0];

  const ranges = initialResults.map((result, index) =>
    investigationEffectiveRange(result, queries[index].view),
  );
  const starts = ranges.flatMap((range) => (range?.startDate ? [range.startDate] : []));
  const ends = ranges.flatMap((range) => (range?.endDate ? [range.endDate] : []));
  const commonStartDate = starts.sort().at(-1) ?? null;
  const commonEndDate = ends.sort().at(0) ?? null;
  const originalEffectiveRanges = initialResults.map((result, index) => ({
    view: queries[index].view,
    startDate: ranges[index]?.startDate ?? null,
    endDate: ranges[index]?.endDate ?? null,
  }));
  const requestedRange = {
    startDate: initialResults[0]?.filters.startDate ?? null,
    endDate: initialResults[0]?.filters.endDate ?? null,
  };

  if (
    ranges.some((range) => !range?.startDate || !range.endDate) ||
    !commonStartDate ||
    !commonEndDate ||
    commonStartDate > commonEndDate
  ) {
    return {
      kind: 'analytics_investigation' as const,
      reason,
      queryCount: initialResults.length,
      comparisonStatus: 'unavailable' as const,
      requestedRange,
      commonEffectiveRange: null,
      originalEffectiveRanges,
      warning:
        'The canonical workspaces have no shared covered period. Discuss source-specific evidence only; do not compare their values or treat missing overlap as zero.',
      results: initialResults,
    };
  }

  const alreadyAligned = ranges.every(
    (range) => range?.startDate === commonStartDate && range.endDate === commonEndDate,
  );
  const results = alreadyAligned
    ? initialResults
    : await Promise.all(
        queries.map((query) =>
          load({
            ...query,
            range: 'custom',
            startDate: commonStartDate,
            endDate: commonEndDate,
          }),
        ),
      );

  const alignedRanges = results.map((result, index) =>
    investigationEffectiveRange(result, queries[index].view),
  );
  const confirmedAligned = alignedRanges.every(
    (range) => range?.startDate === commonStartDate && range.endDate === commonEndDate,
  );
  if (!confirmedAligned) {
    return {
      kind: 'analytics_investigation' as const,
      reason,
      queryCount: results.length,
      comparisonStatus: 'unavailable' as const,
      requestedRange,
      commonEffectiveRange: null,
      originalEffectiveRanges,
      warning:
        'The canonical workspaces could not be recomputed over one identical covered period. Discuss source-specific evidence only; do not compare their values or infer zeros.',
      results,
    };
  }

  return {
    kind: 'analytics_investigation' as const,
    reason,
    queryCount: results.length,
    comparisonStatus: 'aligned' as const,
    requestedRange,
    commonEffectiveRange: { startDate: commonStartDate, endDate: commonEndDate },
    originalEffectiveRanges,
    warning: alreadyAligned
      ? null
      : 'Workspace values were recomputed over their shared effective range before comparison; source-specific tails remain available only in the original coverage evidence.',
    results,
  };
}
