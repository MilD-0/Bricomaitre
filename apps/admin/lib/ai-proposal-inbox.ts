import { and, asc, count, desc, eq, gt, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import type { getDb } from '@bric/db/client';
import { aiProposals, aiRuns } from '@bric/db/schema';

type Database = ReturnType<typeof getDb>;

const optionalFilter = z
  .string()
  .trim()
  .max(120)
  .nullish()
  .transform((value) => value || null);

export const aiProposalInboxQuerySchema = z.object({
  page: z.coerce.number().int().positive().catch(1),
  pageSize: z.coerce.number().int().min(10).max(100).catch(20),
  sort: z.enum(['newest', 'oldest', 'confidence', 'expires', 'type']).catch('newest'),
  q: optionalFilter,
  proposalType: optionalFilter,
  entityType: optionalFilter,
  model: optionalFilter,
  expiry: z.enum(['all', 'active', 'expired']).catch('all'),
  evidence: z.enum(['all', 'present', 'missing']).catch('all'),
});

export type AiProposalInboxQuery = z.infer<typeof aiProposalInboxQuerySchema>;

export function parseAiProposalInboxQuery(
  input: Record<string, string | string[] | undefined>,
): AiProposalInboxQuery {
  const scalar = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
  return aiProposalInboxQuerySchema.parse(scalar);
}

export type AiProposalInboxItem = {
  id: number;
  proposalType: string;
  entityType: string;
  entityId: number;
  payload: unknown;
  reasoning: string | null;
  evidence: Array<{ label: string; url?: string; excerpt?: string }>;
  confidence: number | null;
  requestedBy: string | null;
  expiresAt: string;
  createdAt: string;
  task: string;
  model: string;
};

export type AiProposalInboxData = {
  items: AiProposalInboxItem[];
  query: AiProposalInboxQuery;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  facets: { proposalTypes: string[]; entityTypes: string[]; models: string[] };
};

export type AiProposalAssistantScope = 'products' | 'taxonomy' | 'assets';

const assistantScopeFilter: Record<AiProposalAssistantScope, SQL> = {
  products: and(
    eq(aiProposals.entityType, 'products'),
    inArray(aiProposals.proposalType, [
      'product_content',
      'product_relation',
      'product_discount',
      'entity_edit',
    ]),
  )!,
  taxonomy: and(
    inArray(aiProposals.entityType, ['brands', 'categories']),
    inArray(aiProposals.proposalType, ['entity_edit', 'entity_create']),
  )!,
  assets: inArray(aiProposals.proposalType, ['featured_products', 'landing_page']),
};

export async function loadAiProposalAssistantItems(
  db: Database,
  input: {
    scopes: readonly AiProposalAssistantScope[];
    ids?: readonly number[];
    search?: string;
    limit?: number;
  },
) {
  const scopes = [...new Set(input.scopes)];
  if (scopes.length === 0) return [];
  const ids = [...new Set(input.ids ?? [])].slice(0, 100);
  const search = input.search?.trim().slice(0, 120) ?? '';
  const term = search ? `%${search}%` : null;
  const where = and(
    eq(aiProposals.status, 'proposed'),
    or(...scopes.map((scope) => assistantScopeFilter[scope])),
    ids.length > 0 ? inArray(aiProposals.id, ids) : undefined,
    term
      ? or(
          ilike(aiProposals.proposalType, term),
          ilike(aiProposals.entityType, term),
          ilike(aiRuns.task, term),
          ilike(aiRuns.model, term),
        )
      : undefined,
  );

  const rows = await db
    .select({
      id: aiProposals.id,
      proposalType: aiProposals.proposalType,
      entityType: aiProposals.entityType,
      entityId: aiProposals.entityId,
      payload: aiProposals.payload,
      reasoning: aiProposals.reasoning,
      evidence: aiProposals.evidence,
      confidence: aiProposals.confidence,
      expiresAt: aiProposals.expiresAt,
      createdAt: aiProposals.createdAt,
      task: aiRuns.task,
      model: aiRuns.model,
    })
    .from(aiProposals)
    .innerJoin(aiRuns, eq(aiRuns.id, aiProposals.runId))
    .where(where)
    .orderBy(desc(aiProposals.createdAt), desc(aiProposals.id))
    .limit(Math.min(Math.max(input.limit ?? 20, 1), 50));

  return rows.map((row) => ({
    ...row,
    evidence: row.evidence ?? [],
    confidence: row.confidence === null ? null : Number(row.confidence),
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }));
}

function buildFilters(query: AiProposalInboxQuery, now: Date) {
  const filters: SQL[] = [eq(aiProposals.status, 'proposed')];
  if (query.proposalType) filters.push(eq(aiProposals.proposalType, query.proposalType));
  if (query.entityType) filters.push(eq(aiProposals.entityType, query.entityType));
  if (query.model) filters.push(eq(aiRuns.model, query.model));
  if (query.expiry === 'active') filters.push(gt(aiProposals.expiresAt, now));
  if (query.expiry === 'expired') filters.push(lte(aiProposals.expiresAt, now));
  if (query.evidence === 'present') {
    filters.push(sql`jsonb_array_length(coalesce(${aiProposals.evidence}, '[]'::jsonb)) > 0`);
  }
  if (query.evidence === 'missing') {
    filters.push(sql`jsonb_array_length(coalesce(${aiProposals.evidence}, '[]'::jsonb)) = 0`);
  }
  if (query.q) {
    const term = `%${query.q}%`;
    filters.push(
      or(
        ilike(aiProposals.proposalType, term),
        ilike(aiProposals.entityType, term),
        ilike(aiRuns.task, term),
        ilike(aiRuns.model, term),
        ilike(aiProposals.requestedBy, term),
      )!,
    );
  }
  return and(...filters)!;
}

function orderFor(sort: AiProposalInboxQuery['sort']) {
  switch (sort) {
    case 'oldest':
      return [asc(aiProposals.createdAt), asc(aiProposals.id)];
    case 'confidence':
      return [sql`${aiProposals.confidence} desc nulls last`, desc(aiProposals.createdAt)];
    case 'expires':
      return [asc(aiProposals.expiresAt), desc(aiProposals.createdAt)];
    case 'type':
      return [asc(aiProposals.proposalType), desc(aiProposals.createdAt)];
    default:
      return [desc(aiProposals.createdAt), desc(aiProposals.id)];
  }
}

export async function loadAiProposalInbox(
  db: Database,
  queryInput: AiProposalInboxQuery = aiProposalInboxQuerySchema.parse({}),
): Promise<AiProposalInboxData> {
  const query = aiProposalInboxQuerySchema.parse(queryInput);
  const where = buildFilters(query, new Date());
  const [totalRows, proposalTypes, entityTypes, models] = await Promise.all([
    db
      .select({ value: count() })
      .from(aiProposals)
      .innerJoin(aiRuns, eq(aiRuns.id, aiProposals.runId))
      .where(where),
    db
      .selectDistinct({ value: aiProposals.proposalType })
      .from(aiProposals)
      .where(eq(aiProposals.status, 'proposed'))
      .orderBy(asc(aiProposals.proposalType)),
    db
      .selectDistinct({ value: aiProposals.entityType })
      .from(aiProposals)
      .where(eq(aiProposals.status, 'proposed'))
      .orderBy(asc(aiProposals.entityType)),
    db
      .selectDistinct({ value: aiRuns.model })
      .from(aiProposals)
      .innerJoin(aiRuns, eq(aiRuns.id, aiProposals.runId))
      .where(eq(aiProposals.status, 'proposed'))
      .orderBy(asc(aiRuns.model)),
  ]);
  const total = Number(totalRows[0]?.value ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, totalPages);

  const rows = await db
    .select({
      id: aiProposals.id,
      proposalType: aiProposals.proposalType,
      entityType: aiProposals.entityType,
      entityId: aiProposals.entityId,
      payload: aiProposals.payload,
      reasoning: aiProposals.reasoning,
      evidence: aiProposals.evidence,
      confidence: aiProposals.confidence,
      requestedBy: aiProposals.requestedBy,
      expiresAt: aiProposals.expiresAt,
      createdAt: aiProposals.createdAt,
      task: aiRuns.task,
      model: aiRuns.model,
    })
    .from(aiProposals)
    .innerJoin(aiRuns, eq(aiRuns.id, aiProposals.runId))
    .where(where)
    .orderBy(...orderFor(query.sort))
    .limit(query.pageSize)
    .offset((page - 1) * query.pageSize);

  return {
    items: rows.map((row) => ({
      ...row,
      evidence: row.evidence ?? [],
      confidence: row.confidence === null ? null : Number(row.confidence),
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    })),
    query: { ...query, page },
    pagination: { page, pageSize: query.pageSize, total, totalPages },
    facets: {
      proposalTypes: proposalTypes.map((row) => row.value),
      entityTypes: entityTypes.map((row) => row.value),
      models: models.map((row) => row.value),
    },
  };
}
