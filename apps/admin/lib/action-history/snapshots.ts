import {
  type ActionHistoryChange,
  type ActionHistoryPreview,
  type ActionLogEntry,
  type SnapshotRecord,
} from './contract';

export function isRecord(value: unknown): value is SnapshotRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function serializeSnapshot(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(serializeSnapshot);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entry]) => [key, serializeSnapshot(entry)])
        .filter(([, entry]) => entry !== undefined),
    );
  }
  return value;
}

function areValuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(serializeSnapshot(left)) === JSON.stringify(serializeSnapshot(right));
}

function humanizeFieldName(field: string) {
  return field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (char) => char.toUpperCase());
}

export function getActionHistoryChanges(
  entry: Pick<ActionLogEntry, 'operation' | 'beforeState' | 'afterState'>,
): ActionHistoryChange[] {
  const beforeState = isRecord(entry.beforeState) ? entry.beforeState : {};
  const afterState = isRecord(entry.afterState) ? entry.afterState : {};
  const ignoredKeys = new Set([
    'id',
    'createdAt',
    'updatedAt',
    'stockAllocations',
    'stockHistoryVersion',
  ]);

  return [...new Set([...Object.keys(beforeState), ...Object.keys(afterState)])]
    .filter((key) => !ignoredKeys.has(key))
    .filter((key) => !areValuesEqual(beforeState[key], afterState[key]))
    .map((key) => ({
      key,
      field: humanizeFieldName(key),
      before: beforeState[key] ?? null,
      after: afterState[key] ?? null,
    }));
}

const confirmationFieldKeys = new Set([
  'inHouseStatus',
  'confirmedAt',
  'confirmedBy',
  'confirmedByName',
  'noAnswerCount',
]);

const shipmentFieldKeys = new Set([
  'ecotrackReference',
  'ecotrackStatus',
  'ecotrackStatusLastUpdate',
  'ecotrackTrackingNumber',
]);

function buildActionHistoryPreview(changes: ActionHistoryChange[]): {
  items: ActionHistoryPreview[];
  total: number;
} {
  const items: ActionHistoryPreview[] = [];
  if (changes.some((change) => confirmationFieldKeys.has(change.key))) {
    items.push({ key: 'confirmation', kind: 'group', field: 'Confirmation' });
  }
  if (changes.some((change) => shipmentFieldKeys.has(change.key))) {
    items.push({ key: 'shipment', kind: 'group', field: 'Shipment' });
  }
  for (const change of changes) {
    if (confirmationFieldKeys.has(change.key) || shipmentFieldKeys.has(change.key)) continue;
    items.push({ key: change.key, kind: 'field', field: change.field });
  }

  return { items: items.slice(0, 2), total: items.length };
}

export function toActionHistoryItem(entry: ActionLogEntry) {
  return {
    id: entry.id,
    resource: entry.resource,
    entityType: entry.entityType,
    entityId: entry.entityId,
    entityLabel: entry.entityLabel,
    operation: entry.operation,
    createdBy: entry.createdBy,
    createdByName: entry.createdByName,
    isReversible: entry.isReversible,
    isUndone: entry.isUndone,
    changes: getActionHistoryChanges(entry),
    createdAt: entry.createdAt.toISOString(),
    undoneAt: entry.undoneAt?.toISOString() ?? null,
    redoneAt: entry.redoneAt?.toISOString() ?? null,
  };
}

export function toActionHistoryListItem(entry: ActionLogEntry) {
  const changes = getActionHistoryChanges(entry);
  const preview =
    entry.operation === 'update' ? buildActionHistoryPreview(changes) : { items: [], total: 0 };
  return {
    id: entry.id,
    resource: entry.resource,
    entityType: entry.entityType,
    entityId: entry.entityId,
    entityLabel: entry.entityLabel,
    operation: entry.operation,
    createdBy: entry.createdBy,
    createdByName: entry.createdByName,
    isReversible: entry.isReversible,
    isUndone: entry.isUndone,
    changeCount: changes.length,
    changePreview: preview.items,
    semanticChangeCount: preview.total,
    createdAt: entry.createdAt.toISOString(),
  };
}
