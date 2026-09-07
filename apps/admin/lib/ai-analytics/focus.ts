import { record } from './focus-contract';
import { z } from 'zod';
import { adminAiAnalyticsDatasetSpecs } from '../admin-ai-analytics-datasets';
import type { AnalyticsEffectiveRange, AnalyticsPayload, AnalyticsView } from '../analytics';
import { fieldContracts } from './fields';
import {
  adminAiAnalyticsFocusDimensions,
  adminAiAnalyticsFocusLimitSchema,
  identifierFields,
  type AdminAiAnalyticsFocus,
  type AdminAiAnalyticsFocusDimension,
} from './focus-contract';

export function adminAiAnalyticsFocusSchemaForView(view: AnalyticsView) {
  const dimensions = adminAiAnalyticsFocusDimensions.filter((dimension) =>
    adminAiAnalyticsDatasetSpecs[dimension].views.includes(view),
  );
  const selectorDimensions = dimensions.filter(
    (dimension) => identifierFields[dimension] !== undefined,
  );
  const fixedDimensions = dimensions.filter(
    (dimension) => identifierFields[dimension] === undefined,
  );
  const selectorSchema = selectorDimensions.length
    ? z
        .object({
          dimension: z.enum(
            selectorDimensions as [
              AdminAiAnalyticsFocusDimension,
              ...AdminAiAnalyticsFocusDimension[],
            ],
          ),
          search: z.string().trim().min(1).max(200).optional(),
          identifiers: z
            .array(z.string().trim().min(1).max(200))
            .max(100)
            .default([])
            .describe(
              'Exact entity IDs, keys, or labels. Numeric metric values are not identifiers.',
            ),
          limit: adminAiAnalyticsFocusLimitSchema,
        })
        .strict()
    : null;
  const fixedSchema = fixedDimensions.length
    ? z
        .object({
          dimension: z.enum(
            fixedDimensions as [
              AdminAiAnalyticsFocusDimension,
              ...AdminAiAnalyticsFocusDimension[],
            ],
          ),
          search: z.never().optional(),
          identifiers: z.array(z.never()).max(0).default([]),
          limit: adminAiAnalyticsFocusLimitSchema,
        })
        .strict()
    : null;

  if (selectorSchema && fixedSchema) return z.union([selectorSchema, fixedSchema]);
  if (selectorSchema) return selectorSchema;
  if (fixedSchema) return fixedSchema;
  throw new Error(`Analytics view ${view} has no focused datasets.`);
}

function valueAtPath(value: unknown, path: string[]) {
  let current = value;
  for (const key of path) current = record(current)?.[key];
  return current;
}

function rowsAtPath(value: unknown, path: string[]) {
  const found = valueAtPath(value, path);
  if (Array.isArray(found)) return found;
  return found == null ? [] : [found];
}

function normalized(value: unknown) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase();
}

function scalarValues(value: unknown, depth = 0): string[] {
  if (depth > 4 || value == null) return [];
  if (typeof value === 'string' || typeof value === 'boolean') {
    return [normalized(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => scalarValues(item, depth + 1));
  }
  return record(value)
    ? Object.values(value as Record<string, unknown>).flatMap((item) =>
        scalarValues(item, depth + 1),
      )
    : [];
}

function matchesFocus(row: unknown, focus: AdminAiAnalyticsFocus) {
  const values = scalarValues(row);
  const terms = focus.search ? normalized(focus.search).split(/\s+/u).filter(Boolean) : [];
  if (terms.length && !terms.every((term) => values.some((value) => value.includes(term)))) {
    return false;
  }
  if (focus.identifiers.length) {
    const value = record(row);
    const identifierValues = (identifierFields[focus.dimension] ?? []).flatMap((field) =>
      value?.[field] == null ? [] : [normalized(value[field])],
    );
    const identifiers = focus.identifiers.map(normalized);
    if (!identifiers.some((identifier) => identifierValues.includes(identifier))) return false;
  }
  return true;
}

function effectiveRange(payload: AnalyticsPayload, key: string): AnalyticsEffectiveRange {
  return (
    payload.effectiveRanges.find((range) => range.key === key) ?? {
      key: 'requested',
      startDate: payload.filters.startDate,
      endDate: payload.filters.endDate,
      sources: [],
    }
  );
}

export function focusAnalyticsForAssistant(
  payload: AnalyticsPayload,
  focus: AdminAiAnalyticsFocus,
) {
  const spec = adminAiAnalyticsDatasetSpecs[focus.dimension];
  const path = spec.paths[payload.view] ?? [];
  const availableRows = rowsAtPath(payload.data, path);
  const matchedRows = availableRows.filter((row) => matchesFocus(row, focus));
  const rows = matchedRows.slice(0, focus.limit);
  const relatedPath = spec.relatedPaths?.[payload.view] ?? null;
  const availableRelatedRows = relatedPath ? rowsAtPath(payload.data, relatedPath) : [];
  const matchedRelatedRows = availableRelatedRows.filter((row) => matchesFocus(row, focus));
  const relatedRows = matchedRelatedRows.slice(0, focus.limit);
  const range = effectiveRange(payload, spec.effectiveRangeKey);
  const additionalRanges = (spec.additionalEffectiveRangeKeys ?? []).map((key) =>
    effectiveRange(payload, key),
  );
  const rowContract = [
    ...new Set(
      rows.flatMap((row) => {
        const value = record(row);
        const key = value?.key ?? value?.name;
        return typeof key === 'string' ? [key] : [];
      }),
    ),
  ].flatMap((key) => {
    const semantics = spec.rowSemantics?.[key];
    return semantics ? [{ key, ...semantics }] : [];
  });
  return {
    dimension: focus.dimension,
    definition: spec.definition,
    sources: spec.sources,
    requestedRange: {
      startDate: payload.filters.startDate,
      endDate: payload.filters.endDate,
    },
    effectiveRange: { startDate: range.startDate, endDate: range.endDate },
    effectiveRanges: [range, ...additionalRanges].map((item) => ({
      key: item.key,
      startDate: item.startDate,
      endDate: item.endDate,
      sources: item.sources,
    })),
    dateBasis: spec.dateBasis,
    totalSemantics: spec.totalSemantics,
    fieldContract: fieldContracts(rows, spec, focus.dimension),
    rowContract,
    canonicalPath: path.join('.'),
    search: focus.search ?? null,
    identifiers: focus.identifiers,
    available: availableRows.length,
    matched: matchedRows.length,
    included: rows.length,
    truncated: matchedRows.length > rows.length,
    warning:
      matchedRows.length === 0
        ? 'No row matched in this canonical ranked/filtered decision view. This does not establish that the entity is absent from the underlying business.'
        : null,
    rows,
    related:
      relatedPath && spec.relatedDefinition
        ? {
            definition: spec.relatedDefinition,
            fieldContract: fieldContracts(relatedRows, spec, focus.dimension),
            canonicalPath: relatedPath.join('.'),
            available: availableRelatedRows.length,
            matched: matchedRelatedRows.length,
            included: relatedRows.length,
            truncated: matchedRelatedRows.length > relatedRows.length,
            rows: relatedRows,
          }
        : null,
  };
}
