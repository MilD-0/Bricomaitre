import {
  analytics2QuerySchema,
  getAnalytics2Data,
  type Analytics2Payload,
  type Analytics2Query,
} from './analytics2';

const ADMIN_AI_ANALYTICS_ARRAY_LIMIT = 20;
const ADMIN_AI_ANALYTICS_STRING_LIMIT = 2_000;
const ADMIN_AI_ANALYTICS_MAX_DEPTH = 10;

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
): unknown {
  if (depth > ADMIN_AI_ANALYTICS_MAX_DEPTH) return '[nested data omitted]';
  if (typeof value === 'string') {
    return value.length <= ADMIN_AI_ANALYTICS_STRING_LIMIT
      ? value
      : `${value.slice(0, ADMIN_AI_ANALYTICS_STRING_LIMIT - 1)}…`;
  }
  if (Array.isArray(value)) {
    if (value.length > ADMIN_AI_ANALYTICS_ARRAY_LIMIT) {
      truncations.push({
        path,
        available: value.length,
        included: ADMIN_AI_ANALYTICS_ARRAY_LIMIT,
      });
    }
    return value
      .slice(0, ADMIN_AI_ANALYTICS_ARRAY_LIMIT)
      .map((item, index) => compactValue(item, `${path}[${index}]`, depth + 1, truncations));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        compactValue(child, `${path}.${key}`, depth + 1, truncations),
      ]),
    );
  }
  return value;
}

export function compactAnalytics2ForAssistant(payload: Analytics2Payload) {
  const truncations: AnalyticsTruncation[] = [];
  return {
    kind: 'analytics2' as const,
    // Kept as a string for the current generic tool-result card. `view` is authoritative.
    query: payload.view,
    view: payload.view,
    filters: payload.filters,
    generatedAt: payload.generatedAt,
    referenceDate: payload.referenceDate,
    reviewClock: payload.reviewClock,
    data: compactValue(payload.data, 'data', 0, truncations),
    sources: payload.sources,
    warnings: payload.warnings,
    truncations,
    diagnostics: payload.diagnostics,
  };
}

export async function queryAdminAnalytics(raw: Analytics2Query) {
  const query = analytics2QuerySchema.parse(raw);
  return compactAnalytics2ForAssistant(await getAnalytics2Data(query));
}
