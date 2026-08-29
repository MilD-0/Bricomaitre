import { z } from 'zod';

import { getDb } from '@bric/db/client';

import { loadOrderDetail, loadOrdersPageData } from './admin-orders-data';
import { startOrderExportJob } from './background-jobs';
import { readEcotrackCatalog } from './ecotrack';
import {
  buildOrderExportFileName,
  buildOrderExportRows,
  filterRecentConfirmedOrders,
} from './order-export';

export const adminAiOrderExportScopeSchema = z
  .object({
    mode: z.enum(['selected', 'confirmed']),
    orderIds: z.array(z.number().int().positive()).max(2_000),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.mode === 'selected' && input.orderIds.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['orderIds'],
        message: 'Selected exports require exact inspected order IDs.',
      });
    }
    if (input.mode === 'confirmed' && input.orderIds.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['orderIds'],
        message: 'The complete recent confirmed cohort uses an empty orderIds array.',
      });
    }
  });

async function loadAllConfirmedOrders() {
  const items = [];
  let page = 1;
  let totalPages = 1;
  do {
    const response = await loadOrdersPageData(
      {
        page,
        limit: 100,
        inHouseStatus: 2,
        search: '',
        sortKey: 'createdAt',
        sortDirection: 'desc',
      },
      false,
    );
    items.push(...response.items);
    totalPages = response.pagination.totalPages;
    page += 1;
  } while (page <= totalPages);
  return items;
}

async function resolveOrderExportScope(
  input: z.output<typeof adminAiOrderExportScopeSchema>,
  now = new Date(),
) {
  if (input.mode === 'selected') {
    const orderIds = [...new Set(input.orderIds)];
    const loaded = await Promise.all(orderIds.map((orderId) => loadOrderDetail(orderId)));
    return {
      orders: loaded.flatMap((order) => (order ? [order] : [])),
      missingOrderIds: orderIds.filter((_, index) => loaded[index] == null),
      staleConfirmedOrderIds: [] as number[],
    };
  }

  const confirmed = await loadAllConfirmedOrders();
  const recent = filterRecentConfirmedOrders(confirmed, now);
  const recentIds = new Set(recent.map((order) => order.id));
  return {
    orders: recent,
    missingOrderIds: [] as number[],
    staleConfirmedOrderIds: confirmed
      .filter((order) => !recentIds.has(order.id))
      .map((order) => order.id),
  };
}

function missingRequiredExportFields(rows: ReturnType<typeof buildOrderExportRows>) {
  const requiredFields = [
    'fullName',
    'phoneNumber',
    'wilayaCode',
    'commune',
    'address',
    'product',
    'totalToCollect',
  ] as const;
  return rows.flatMap((row) => {
    const fields = requiredFields.filter((field) => !row[field].trim());
    return fields.length > 0 ? [{ orderId: Number(row.reference), fields }] : [];
  });
}

function compactIds(ids: number[], limit = 100) {
  return {
    ids: ids.slice(0, limit),
    count: ids.length,
    truncated: ids.length > limit,
  };
}

export async function previewAdminAiOrderExport(
  input: z.input<typeof adminAiOrderExportScopeSchema>,
  now = new Date(),
) {
  const values = adminAiOrderExportScopeSchema.parse(input);
  const resolved = await resolveOrderExportScope(values, now);
  const rows = buildOrderExportRows(resolved.orders, await readEcotrackCatalog(getDb()));
  const previewLimit = 20;
  const resolvedIds = compactIds(resolved.orders.map((order) => order.id));
  const staleIds = compactIds(resolved.staleConfirmedOrderIds);
  return {
    kind: 'order_export_preview' as const,
    mode: values.mode,
    fileName: buildOrderExportFileName(values.mode, now),
    resolvedOrderCount: resolvedIds.count,
    orderIds: resolvedIds.ids,
    orderIdsTruncated: resolvedIds.truncated,
    rowCount: rows.length,
    missingOrderIds: resolved.missingOrderIds,
    staleConfirmedOrderCount: staleIds.count,
    staleConfirmedOrderIds: staleIds.ids,
    staleConfirmedOrderIdsTruncated: staleIds.truncated,
    missingRequiredFields: missingRequiredExportFields(rows),
    previewRows: rows.slice(0, previewLimit),
    previewRowsTruncated: rows.length > previewLimit,
    completionEffect: 'order statuses are unchanged' as const,
  };
}

export async function startAdminAiOrderExport(
  input: z.input<typeof adminAiOrderExportScopeSchema>,
  context: { ownerKey: string; conversationId?: number },
  now = new Date(),
) {
  const values = adminAiOrderExportScopeSchema.parse(input);
  const resolved = await resolveOrderExportScope(values, now);
  if (resolved.orders.length === 0) {
    return {
      ok: false as const,
      kind: 'order_export_not_started' as const,
      error: 'no_exportable_orders' as const,
      mode: values.mode,
      missingOrderIds: resolved.missingOrderIds,
      staleConfirmedOrderIds: resolved.staleConfirmedOrderIds,
    };
  }
  const orderIds = resolved.orders.map((order) => order.id);
  const result = await startOrderExportJob(
    context.ownerKey,
    { mode: values.mode, orderIds },
    undefined,
    { conversationId: context.conversationId },
  );
  const resolvedIds = compactIds(orderIds);
  const staleIds = compactIds(resolved.staleConfirmedOrderIds);
  return {
    ok: result.kind !== 'busy',
    kind:
      result.kind === 'busy' ? ('order_export_busy' as const) : ('order_export_started' as const),
    mode: values.mode,
    resolvedOrderCount: resolvedIds.count,
    orderIds: resolvedIds.ids,
    orderIdsTruncated: resolvedIds.truncated,
    missingOrderIds: resolved.missingOrderIds,
    staleConfirmedOrderCount: staleIds.count,
    staleConfirmedOrderIds: staleIds.ids,
    staleConfirmedOrderIdsTruncated: staleIds.truncated,
    completionEffect: 'order statuses are unchanged' as const,
    job: result.job,
    startDisposition: result.kind,
  };
}
