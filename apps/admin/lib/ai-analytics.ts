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
} from './admin-ai-analytics-contract';
import {
  adminAiAnalyticsFocusSchema,
  focusAnalytics2ForAssistant,
  validateAdminAiAnalyticsFocus,
  type AdminAiAnalyticsFocus,
} from './admin-ai-analytics-focus';

const ADMIN_AI_ANALYTICS_ARRAY_LIMIT = 20;
const ADMIN_AI_ANALYTICS_STRING_LIMIT = 2_000;
const ADMIN_AI_ANALYTICS_MAX_DEPTH = 10;

export const ADMIN_AI_ANALYTICS_TOOL_DESCRIPTION =
  'Read exactly one canonical Analytics workspace with Bricomaitre semantics version 4. Plan the smallest sufficient query before calling: command is the executive cross-section; money owns profit meanings, paid contribution, Profit ×, forecasts, posting cohorts, and Friday calculator accounting; acquisition owns Meta entities, attribution, and paid efficiency; fulfillment owns order/shipment lifecycle and attempts; storefront owns first-party sessions and funnel; search owns Search Console; catalog owns product/customer/geography decisions; assumptions owns planning returns, FX, and costs. Explicit dates require range custom plus exact startDate and endDate. Exact datasets require the compatible focus.dimension in this same first call. The result contains all semantic definitions, requested/effective ranges, cutoffs, maturity, estimation, and up to 100 focused rows needed for the final answer. Call once, then answer from that result; do not issue exploratory follow-up queries or substitute conventional ecommerce meanings. Raw SQL is never accepted.';

type AnalyticsTruncation = {
  path: string;
  available: number;
  included: number;
};

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
  const assistantData = focusedDataset
    ? { kind: payload.view, metrics, focus: focusedDataset }
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
    responseContractVersion: 1 as const,
    semanticContract: ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT,
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

export type AdminAiAnalyticsQuery = z.input<typeof adminAiAnalyticsQuerySchema>;

export async function queryAdminAnalytics(raw: AdminAiAnalyticsQuery) {
  const { focus, ...rawQuery } = adminAiAnalyticsQuerySchema.parse(raw);
  const query = analytics2QuerySchema.parse(rawQuery) as Analytics2Query;
  return compactAnalytics2ForAssistant(await getAnalytics2Data(query), focus);
}
