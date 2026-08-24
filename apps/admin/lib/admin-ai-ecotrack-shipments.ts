import { z } from 'zod';

import type { ActionActor } from './action-history';
import {
  addEcotrackMaj,
  deletePostedEcotrackOrder,
  dispatchEcotrackOrdersBatch,
  loadEcotrackOrderDetail,
  loadEcotrackOrdersPageData,
  parseEcotrackShipmentUpdateDraft,
  recreatePostedEcotrackOrder,
  refreshEcotrackOrdersBatch,
  requestEcotrackReturn,
  updatePostedEcotrackOrder,
  type EcotrackOrderUpdateDraft,
} from './admin-ecotrack-orders-data';
import type { EcotrackShipmentDetail } from './ecotrack-admin-contracts';

const shipmentSortKeySchema = z.enum([
  'createdAt',
  'trackingNumber',
  'clientName',
  'currentStatus',
  'lastStatusSyncedAt',
]);

export const adminAiEcotrackShipmentInspectionSchema = z.discriminatedUnion('scope', [
  z
    .object({
      scope: z.literal('exact'),
      orderIds: z.array(z.number().int().positive()).min(1).max(20),
    })
    .strict(),
  z
    .object({
      scope: z.literal('filtered'),
      page: z.number().int().positive().default(1),
      limit: z.number().int().min(1).max(100).default(25),
      search: z.string().trim().max(200).default(''),
      status: z.string().trim().max(100).default('all'),
      staleOnly: z.boolean().default(false),
      sortKey: shipmentSortKeySchema.default('createdAt'),
      sortDirection: z.enum(['asc', 'desc']).default('desc'),
    })
    .strict(),
]);

const orderIdsSchema = z.array(z.number().int().positive()).min(1).max(100);

export const adminAiEcotrackShipmentActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('refresh'), orderIds: orderIdsSchema }).strict(),
  z
    .object({
      action: z.literal('dispatch'),
      orderIds: orderIdsSchema,
      askCollection: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      action: z.literal('add_update'),
      items: z
        .array(
          z
            .object({
              orderId: z.number().int().positive(),
              content: z.string().trim().min(1).max(255),
            })
            .strict(),
        )
        .min(1)
        .max(20),
    })
    .strict(),
  z.object({ action: z.literal('request_return'), orderIds: orderIdsSchema }).strict(),
  z.object({ action: z.literal('prepare_labels'), orderIds: orderIdsSchema }).strict(),
  z.object({ action: z.literal('delete'), orderIds: orderIdsSchema }).strict(),
]);

const shipmentChangeOperationSchema = z.discriminatedUnion('field', [
  z.object({ field: z.literal('firstName'), value: z.string().trim().min(1).max(80) }).strict(),
  z.object({ field: z.literal('lastName'), value: z.string().trim().max(80) }).strict(),
  z.object({ field: z.literal('phoneNumber1'), value: z.string().trim().min(1).max(50) }).strict(),
  z
    .object({
      field: z.literal('phoneNumber2'),
      value: z.string().trim().max(50).nullable(),
    })
    .strict(),
  z.object({ field: z.literal('delivery'), value: z.enum(['home', 'stop_desk']) }).strict(),
  z
    .object({
      field: z.literal('wilayaId'),
      value: z.number().int().min(1).max(58).nullable(),
    })
    .strict(),
  z.object({ field: z.literal('commune'), value: z.string().trim().min(1).max(120) }).strict(),
  z.object({ field: z.literal('homeAddress'), value: z.string().trim().max(300) }).strict(),
  z.object({ field: z.literal('note'), value: z.string().trim().max(500).nullable() }).strict(),
  z
    .object({
      field: z.literal('cartProductTokens'),
      value: z.array(z.string().trim().min(1).max(160)).max(50),
    })
    .strict(),
  z
    .object({
      field: z.literal('deliveryFee'),
      value: z.number().finite().nonnegative().nullable(),
    })
    .strict(),
  z
    .object({
      field: z.literal('subtotalOverride'),
      value: z.number().finite().nonnegative().nullable(),
    })
    .strict(),
]);

export const adminAiEcotrackShipmentChangeSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            orderId: z.number().int().positive(),
            mode: z.enum(['auto', 'edit', 'recreate']).default('auto'),
            operations: z.array(shipmentChangeOperationSchema).min(1).max(12),
          })
          .strict()
          .superRefine((item, context) => {
            const seen = new Set<string>();
            item.operations.forEach((operation, index) => {
              if (seen.has(operation.field)) {
                context.addIssue({
                  code: 'custom',
                  message: `Shipment field ${operation.field} can only be changed once.`,
                  path: ['operations', index, 'field'],
                });
              }
              seen.add(operation.field);
            });
          }),
      )
      .min(1)
      .max(20),
  })
  .strict();

function uniqueOrderIds(orderIds: readonly number[]) {
  return [...new Set(orderIds)];
}

function compactShipment(item: EcotrackShipmentDetail) {
  return {
    orderId: item.orderId,
    reference: item.reference,
    trackingNumber: item.trackingNumber,
    provider: item.provider,
    currentStatus: item.status.currentStatus,
    canEdit: item.canEdit,
    canDelete: item.canDelete,
    canDispatch: item.canDispatch,
    canEditAndRecreate: item.canEditAndRecreate,
    canAddMaj: item.canAddMaj,
    canAskReturn: item.canAskReturn,
    canPrintLabel: item.canPrintLabel,
  };
}

export async function inspectAdminAiEcotrackShipments(
  input: z.input<typeof adminAiEcotrackShipmentInspectionSchema>,
) {
  const parsed = adminAiEcotrackShipmentInspectionSchema.parse(input);
  if (parsed.scope === 'filtered') {
    const result = await loadEcotrackOrdersPageData(
      {
        page: parsed.page,
        limit: parsed.limit,
        search: parsed.search,
        status: parsed.status,
        staleOnly: parsed.staleOnly,
        sortKey: parsed.sortKey,
        sortDirection: parsed.sortDirection,
      },
      true,
      { ensureFreshVisiblePage: true },
    );
    return { kind: 'ecotrack_shipments' as const, scope: parsed.scope, ...result };
  }

  const items: EcotrackShipmentDetail[] = [];
  const failures: Array<{ orderId: number; message: string }> = [];
  for (const orderId of uniqueOrderIds(parsed.orderIds)) {
    try {
      const item = await loadEcotrackOrderDetail(orderId);
      if (item) items.push(item);
      else failures.push({ orderId, message: `Order #${orderId}: ECOTRACK shipment not found.` });
    } catch (error) {
      failures.push({
        orderId,
        message: error instanceof Error ? error.message : 'Unable to inspect ECOTRACK shipment.',
      });
    }
  }
  return {
    kind: 'ecotrack_shipments' as const,
    scope: parsed.scope,
    items,
    failures,
    requestedCount: uniqueOrderIds(parsed.orderIds).length,
    foundCount: items.length,
  };
}

function commonBatchResult(
  action: string,
  result: Awaited<ReturnType<typeof refreshEcotrackOrdersBatch>>,
) {
  return {
    kind: 'ecotrack_shipment_action' as const,
    action,
    ok: result.ok,
    items: result.items.map(compactShipment),
    failures: result.failures,
    successCount: result.successCount,
    failureCount: result.failureCount,
    totalRequested: result.totalRequested,
  };
}

export async function manageAdminAiEcotrackShipments(
  input: z.input<typeof adminAiEcotrackShipmentActionSchema>,
  actor: ActionActor,
) {
  const parsed = adminAiEcotrackShipmentActionSchema.parse(input);
  if (parsed.action === 'refresh') {
    return commonBatchResult(
      parsed.action,
      await refreshEcotrackOrdersBatch(uniqueOrderIds(parsed.orderIds), actor),
    );
  }
  if (parsed.action === 'dispatch') {
    return commonBatchResult(
      parsed.action,
      await dispatchEcotrackOrdersBatch(
        uniqueOrderIds(parsed.orderIds),
        { askCollection: parsed.askCollection },
        actor,
      ),
    );
  }
  if (parsed.action === 'prepare_labels') {
    const items: Array<ReturnType<typeof compactShipment> & { downloadUrl: string }> = [];
    const failures: Array<{ orderId: number; message: string }> = [];
    const orderIds = uniqueOrderIds(parsed.orderIds);
    for (const orderId of orderIds) {
      try {
        const item = await loadEcotrackOrderDetail(orderId, actor);
        if (!item) throw new Error('ECOTRACK shipment not found.');
        if (!item.canPrintLabel) {
          throw new Error('A label is not available for this shipment in its current state.');
        }
        items.push({
          ...compactShipment(item),
          downloadUrl: `/api/orders/ecotrack/shipments/${orderId}/label`,
        });
      } catch (error) {
        failures.push({
          orderId,
          message: error instanceof Error ? error.message : 'Unable to prepare shipment label.',
        });
      }
    }
    return {
      kind: 'ecotrack_shipment_action' as const,
      action: parsed.action,
      ok: items.length > 0,
      items,
      failures,
      successCount: items.length,
      failureCount: failures.length,
      totalRequested: orderIds.length,
    };
  }

  const items: Array<ReturnType<typeof compactShipment> | { orderId: number; deleted: true }> = [];
  const failures: Array<{ orderId: number; message: string }> = [];
  if (parsed.action === 'add_update') {
    for (const request of parsed.items) {
      try {
        const item = await addEcotrackMaj(request.orderId, request.content, actor);
        if (!item) throw new Error('ECOTRACK shipment not found.');
        items.push(compactShipment(item));
      } catch (error) {
        failures.push({
          orderId: request.orderId,
          message: error instanceof Error ? error.message : 'ECOTRACK shipment action failed.',
        });
      }
    }
  } else {
    for (const orderId of uniqueOrderIds(parsed.orderIds)) {
      try {
        if (parsed.action === 'delete') {
          const result = await deletePostedEcotrackOrder(orderId, actor);
          if (!result) throw new Error('ECOTRACK shipment not found.');
          items.push({ orderId, deleted: true });
          continue;
        }
        const item = await requestEcotrackReturn(orderId, actor);
        if (!item) throw new Error('ECOTRACK shipment not found.');
        items.push(compactShipment(item));
      } catch (error) {
        failures.push({
          orderId,
          message: error instanceof Error ? error.message : 'ECOTRACK shipment action failed.',
        });
      }
    }
  }
  const totalRequested =
    parsed.action === 'add_update' ? parsed.items.length : uniqueOrderIds(parsed.orderIds).length;
  return {
    kind: 'ecotrack_shipment_action' as const,
    action: parsed.action,
    ok: items.length > 0,
    items,
    failures,
    successCount: items.length,
    failureCount: failures.length,
    totalRequested,
  };
}

function shipmentDraft(item: EcotrackShipmentDetail): EcotrackOrderUpdateDraft {
  return parseEcotrackShipmentUpdateDraft({
    firstName: item.firstName ?? '',
    lastName: item.lastName ?? '',
    phoneNumber1: item.phoneNumber1,
    phoneNumber2: item.phoneNumber2,
    delivery: item.delivery,
    state: item.state,
    city: item.city ?? '',
    homeAddress: item.homeAddress ?? '',
    note: item.note,
    cartProducts: item.orderProducts.flatMap((product) =>
      Array.from(
        { length: product.quantity },
        () => product.rawValue ?? String(product.productId ?? product.title),
      ),
    ),
    deliveryFee: item.deliveryFee,
    subtotalOverride: item.subtotalOverride,
  });
}

function applyShipmentOperations(
  current: EcotrackShipmentDetail,
  operations: z.output<typeof shipmentChangeOperationSchema>[],
) {
  const draft = shipmentDraft(current);
  for (const operation of operations) {
    switch (operation.field) {
      case 'delivery':
        draft.delivery = operation.value === 'home' ? 0 : 1;
        break;
      case 'wilayaId':
        draft.state = operation.value;
        break;
      case 'commune':
        draft.city = operation.value;
        break;
      case 'cartProductTokens':
        draft.cartProducts = operation.value;
        break;
      case 'firstName':
        draft.firstName = operation.value;
        break;
      case 'lastName':
        draft.lastName = operation.value;
        break;
      case 'phoneNumber1':
        draft.phoneNumber1 = operation.value;
        break;
      case 'phoneNumber2':
        draft.phoneNumber2 = operation.value;
        break;
      case 'homeAddress':
        draft.homeAddress = operation.value;
        break;
      case 'note':
        draft.note = operation.value;
        break;
      case 'deliveryFee':
        draft.deliveryFee = operation.value;
        break;
      case 'subtotalOverride':
        draft.subtotalOverride = operation.value;
        break;
    }
  }
  return parseEcotrackShipmentUpdateDraft(draft);
}

export async function changeAdminAiEcotrackShipments(
  input: z.input<typeof adminAiEcotrackShipmentChangeSchema>,
  actor: ActionActor,
) {
  const parsed = adminAiEcotrackShipmentChangeSchema.parse(input);
  const items: Array<ReturnType<typeof compactShipment> & { operation: 'edit' | 'recreate' }> = [];
  const failures: Array<{ orderId: number; message: string }> = [];

  for (const request of parsed.items) {
    try {
      const current = await loadEcotrackOrderDetail(request.orderId, actor);
      if (!current) throw new Error('ECOTRACK shipment not found.');
      const operation =
        request.mode === 'auto'
          ? current.canEdit
            ? 'edit'
            : current.canEditAndRecreate
              ? 'recreate'
              : null
          : request.mode;
      if (!operation) {
        throw new Error('This shipment can no longer be edited or recreated in its current state.');
      }
      const draft = applyShipmentOperations(current, request.operations);
      const item =
        operation === 'edit'
          ? await updatePostedEcotrackOrder(request.orderId, draft, actor)
          : await recreatePostedEcotrackOrder(request.orderId, draft, actor);
      if (!item) throw new Error('ECOTRACK shipment not found.');
      items.push({ ...compactShipment(item), operation });
    } catch (error) {
      failures.push({
        orderId: request.orderId,
        message: error instanceof Error ? error.message : 'ECOTRACK shipment change failed.',
      });
    }
  }

  return {
    kind: 'ecotrack_shipment_change' as const,
    ok: items.length > 0,
    items,
    failures,
    successCount: items.length,
    failureCount: failures.length,
    totalRequested: parsed.items.length,
  };
}
