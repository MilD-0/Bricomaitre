import { and, desc, eq, gte, ilike, lte, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@bric/db/client';
import { offPipelineSales } from '@bric/db/schema';
import { mutateEntityWithHistoryTransaction, type ActionActor } from './action-history';
import { runIdempotentAdminMutation } from './admin-mutation-idempotency';
import { reportingDateSchema } from './analytics/contract';

type Database = ReturnType<typeof getDb>;
type StoredSale = typeof offPipelineSales.$inferSelect;

const amountSchema = z.number().finite().nonnegative().max(1_000_000_000_000);
const collectedAmountSchema = z.number().finite().positive().max(1_000_000_000_000);
const nullableText = (max: number) => z.string().trim().min(1).max(max).nullable();

export const offPipelineSaleFieldsSchema = z
  .object({
    reference: nullableText(160).optional().default(null),
    description: z.string().trim().min(1).max(160),
    recognizedOn: reportingDateSchema.describe(
      'Africa/Algiers business date on which the money was received.',
    ),
    amountCollectedDzd: collectedAmountSchema,
    feesDzd: amountSchema,
    productCostDzd: amountSchema,
    note: nullableText(500).optional().default(null),
  })
  .strict();

export const offPipelineSaleCreateSchema = offPipelineSaleFieldsSchema.safeExtend({
  requestId: z.uuid(),
});

export const offPipelineSalePatchSchema = z
  .object({
    reference: nullableText(160).optional(),
    description: z.string().trim().min(1).max(160).optional(),
    recognizedOn: reportingDateSchema.optional(),
    amountCollectedDzd: collectedAmountSchema.optional(),
    feesDzd: amountSchema.optional(),
    productCostDzd: amountSchema.optional(),
    note: nullableText(500).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one sale change.');

export const offPipelineSaleUpdateSchema = z
  .object({
    id: z.number().int().positive(),
    requestId: z.uuid(),
    changes: offPipelineSalePatchSchema,
  })
  .strict();

export const offPipelineSaleDeleteSchema = z
  .object({ id: z.number().int().positive(), requestId: z.uuid() })
  .strict();

export const offPipelineSaleQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().trim().max(160).default(''),
    startDate: reportingDateSchema.optional(),
    endDate: reportingDateSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.startDate && value.endDate && value.startDate > value.endDate) {
      context.addIssue({
        code: 'custom',
        message: 'startDate must not follow endDate.',
        path: ['startDate'],
      });
    }
  });

function numeric(value: string | number) {
  return Number(value);
}

function mapSale(row: StoredSale) {
  const amountCollectedDzd = numeric(row.amountCollected);
  const feesDzd = numeric(row.fees);
  const productCostDzd = numeric(row.productCost);
  return {
    id: row.id,
    reference: row.reference,
    description: row.description,
    recognizedOn: row.recognizedOn,
    amountCollectedDzd,
    feesDzd,
    productCostDzd,
    netRevenueDzd: amountCollectedDzd - feesDzd,
    realizedProfitDzd: amountCollectedDzd - feesDzd - productCostDzd,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function storedValues(value: z.infer<typeof offPipelineSaleFieldsSchema>) {
  return {
    reference: value.reference,
    description: value.description,
    recognizedOn: value.recognizedOn,
    amountCollected: String(value.amountCollectedDzd),
    fees: String(value.feesDzd),
    productCost: String(value.productCostDzd),
    note: value.note,
  };
}

export async function listOffPipelineSales(
  raw: z.input<typeof offPipelineSaleQuerySchema> = {},
  db: Database = getDb(),
) {
  const query = offPipelineSaleQuerySchema.parse(raw);
  const conditions: SQL[] = [];
  if (query.startDate) conditions.push(gte(offPipelineSales.recognizedOn, query.startDate));
  if (query.endDate) conditions.push(lte(offPipelineSales.recognizedOn, query.endDate));
  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(
      or(
        ilike(offPipelineSales.reference, pattern),
        ilike(offPipelineSales.description, pattern),
        ilike(offPipelineSales.note, pattern),
      )!,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const countRows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(offPipelineSales)
    .where(where);
  const total = countRows[0]?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / query.limit));
  const page = Math.min(query.page, totalPages);
  const rows = await db
    .select()
    .from(offPipelineSales)
    .where(where)
    .orderBy(desc(offPipelineSales.recognizedOn), desc(offPipelineSales.id))
    .limit(query.limit)
    .offset((page - 1) * query.limit);
  return {
    items: rows.map(mapSale),
    pagination: {
      page,
      limit: query.limit,
      totalItems: total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

export async function createOffPipelineSale(
  raw: z.input<typeof offPipelineSaleCreateSchema>,
  actor?: ActionActor,
  db: Database = getDb(),
) {
  const { requestId, ...fields } = offPipelineSaleCreateSchema.parse(raw);
  const result = await runIdempotentAdminMutation(db, {
    scope: 'off-pipeline-sale:create',
    requestId,
    payload: fields,
    execute: async (tx) => {
      const row = await mutateEntityWithHistoryTransaction<StoredSale>(tx, {
        entityType: 'offPipelineSales',
        operation: 'create',
        actor,
        resolveEntityId: (created) => created.id,
        execute: async (writer) => {
          const [created] = await writer
            .insert(offPipelineSales)
            .values(storedValues(fields))
            .returning();
          return created;
        },
      });
      return { status: 'created' as const, current: mapSale(row) };
    },
  });
  return { ...result.value, replayed: result.replayed };
}

export async function updateOffPipelineSale(
  raw: z.input<typeof offPipelineSaleUpdateSchema>,
  actor?: ActionActor,
  db: Database = getDb(),
) {
  const input = offPipelineSaleUpdateSchema.parse(raw);
  const result = await runIdempotentAdminMutation(db, {
    scope: 'off-pipeline-sale:update',
    requestId: input.requestId,
    payload: { id: input.id, changes: input.changes },
    execute: async (tx) => {
      const [stored] = await tx
        .select()
        .from(offPipelineSales)
        .where(eq(offPipelineSales.id, input.id))
        .limit(1);
      if (!stored) return { status: 'not_found' as const, id: input.id };
      const previous = mapSale(stored);
      const next = offPipelineSaleFieldsSchema.parse({
        reference: previous.reference,
        description: previous.description,
        recognizedOn: previous.recognizedOn,
        amountCollectedDzd: previous.amountCollectedDzd,
        feesDzd: previous.feesDzd,
        productCostDzd: previous.productCostDzd,
        note: previous.note,
        ...input.changes,
      });
      const row = await mutateEntityWithHistoryTransaction<StoredSale>(tx, {
        entityType: 'offPipelineSales',
        entityId: input.id,
        operation: 'update',
        actor,
        execute: async (writer) => {
          const [updated] = await writer
            .update(offPipelineSales)
            .set({ ...storedValues(next), updatedAt: new Date() })
            .where(eq(offPipelineSales.id, input.id))
            .returning();
          return updated;
        },
      });
      return { status: 'updated' as const, previous, current: mapSale(row) };
    },
  });
  return { ...result.value, replayed: result.replayed };
}

export async function deleteOffPipelineSale(
  raw: z.input<typeof offPipelineSaleDeleteSchema>,
  actor?: ActionActor,
  db: Database = getDb(),
) {
  const input = offPipelineSaleDeleteSchema.parse(raw);
  const result = await runIdempotentAdminMutation(db, {
    scope: 'off-pipeline-sale:delete',
    requestId: input.requestId,
    payload: { id: input.id },
    execute: async (tx) => {
      const [stored] = await tx
        .select()
        .from(offPipelineSales)
        .where(eq(offPipelineSales.id, input.id))
        .limit(1);
      if (!stored) return { status: 'not_found' as const, id: input.id };
      const previous = mapSale(stored);
      await mutateEntityWithHistoryTransaction(tx, {
        entityType: 'offPipelineSales',
        entityId: input.id,
        operation: 'delete',
        actor,
        execute: (writer) =>
          writer.delete(offPipelineSales).where(eq(offPipelineSales.id, input.id)),
      });
      return { status: 'deleted' as const, previous };
    },
  });
  return { ...result.value, replayed: result.replayed };
}
