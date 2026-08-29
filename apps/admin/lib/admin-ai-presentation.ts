import { z } from 'zod';

import { adminAiToolResultsFromUnknown, type AdminAiToolResult } from './admin-ai-result-view';

const presentationReferenceSchema = z.object({
  toolName: z.string().trim().min(1).max(100),
  occurrence: z.number().int().min(0).max(7).default(0),
});

const presentationTitleSchema = z.string().trim().min(1).max(100).optional();

const adminAiPresentationBlockSchema = z.discriminatedUnion('kind', [
  presentationReferenceSchema.extend({
    kind: z.literal('metrics'),
    title: presentationTitleSchema,
    keys: z
      .array(z.string().trim().min(1).max(100))
      .min(1)
      .max(6)
      .describe('Exact metric key or name values present in the referenced tool result.'),
  }),
  presentationReferenceSchema.extend({
    kind: z.literal('source_health'),
    title: presentationTitleSchema,
    keys: z
      .array(z.string().trim().min(1).max(100))
      .min(1)
      .max(6)
      .describe('Exact source key values present in the referenced Analytics result.'),
  }),
  presentationReferenceSchema.extend({
    kind: z.literal('records'),
    title: presentationTitleSchema,
    path: z
      .string()
      .trim()
      .min(1)
      .max(240)
      .regex(/^[A-Za-z0-9_.\[\]-]+$/u)
      .describe('Path to an array inside the referenced tool output, without an output prefix.'),
    columns: z
      .array(z.string().trim().min(1).max(100))
      .min(1)
      .max(6)
      .describe('Exact scalar field names present on the selected records.'),
    limit: z.number().int().min(1).max(10).default(5),
  }),
  presentationReferenceSchema.extend({
    kind: z.literal('destination'),
    title: presentationTitleSchema,
  }),
]);

export const adminAiPresentationPlanSchema = z
  .object({
    kind: z.literal('admin_ui_blocks_v1').default('admin_ui_blocks_v1'),
    blocks: z.array(adminAiPresentationBlockSchema).min(1).max(4),
  })
  .strict();

export type AdminAiPresentationBlock = z.infer<typeof adminAiPresentationBlockSchema>;
export type AdminAiPresentationPlan = z.infer<typeof adminAiPresentationPlanSchema>;

export const ADMIN_AI_PRESENTATION_TOOL_NAME = 'present_admin_ui' as const;

export const ADMIN_AI_PRESENTATION_TOOL_DESCRIPTION = [
  'Optionally select small UI building blocks after reading application evidence. Most answers need prose only.',
  'Use metrics for a few values, source_health for source states, records for useful exact rows, and destination for a useful workspace link.',
  'Reference only exact tool names, paths, keys, and columns from this turn. Keep the selection smaller than the result and still answer in prose.',
].join(' ');

export function adminAiPresentationFromToolResults(value: unknown) {
  for (const result of adminAiToolResultsFromUnknown(value)) {
    if (result.toolName !== ADMIN_AI_PRESENTATION_TOOL_NAME) continue;
    const parsed = adminAiPresentationPlanSchema.safeParse(result.output);
    if (parsed.success) return parsed.data;
  }
  return null;
}

export function adminAiEvidenceToolResults(value: unknown) {
  return adminAiToolResultsFromUnknown(value).filter(
    (result) => result.toolName !== ADMIN_AI_PRESENTATION_TOOL_NAME,
  );
}

export function adminAiPresentationToolResult(
  results: readonly AdminAiToolResult[],
  block: Pick<AdminAiPresentationBlock, 'toolName' | 'occurrence'>,
) {
  return results.filter((result) => result.toolName === block.toolName)[block.occurrence] ?? null;
}

function pathSegments(path: string) {
  return path
    .replaceAll(/\[(\d+)\]/gu, '.$1')
    .split('.')
    .filter(Boolean);
}

export function adminAiPresentationValueAtPath(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of pathSegments(path)) {
    if (Array.isArray(current) && /^\d+$/u.test(segment)) {
      current = current[Number(segment)];
      continue;
    }
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
