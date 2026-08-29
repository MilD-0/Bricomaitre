import type { AiProposalInboxItem } from './ai-proposal-inbox';

export type ProposalField = {
  key: string;
  before: unknown;
  after: unknown;
  hasBefore: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function humanizeProposalToken(value: string) {
  return value
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll(/[_-]+/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .replace(/^./, (character) => character.toUpperCase());
}

export function proposalFields(payload: unknown): ProposalField[] {
  if (!isRecord(payload)) return [];

  const before = isRecord(payload.before) ? payload.before : {};
  if (isRecord(payload.changes)) {
    return Object.entries(payload.changes).map(([key, after]) => ({
      key,
      before: before[key],
      after,
      hasBefore: Object.prototype.hasOwnProperty.call(before, key),
    }));
  }

  return [];
}

export function proposalPreview(item: AiProposalInboxItem) {
  const fields = proposalFields(item.payload);
  if (fields.length > 0) {
    return {
      kind: 'fields' as const,
      fields: fields.slice(0, 2).map((field) => humanizeProposalToken(field.key)),
      remaining: Math.max(0, fields.length - 2),
    };
  }

  const payload = isRecord(item.payload) ? item.payload : null;
  if (item.proposalType === 'product_relation') {
    return {
      kind: 'relation' as const,
      relation:
        typeof payload?.relationType === 'string'
          ? humanizeProposalToken(payload.relationType)
          : null,
    };
  }

  return {
    kind: 'payload' as const,
    count: payload ? Object.keys(payload).length : item.payload == null ? 0 : 1,
  };
}

export function proposalValueSummary(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number' || typeof value === 'string') return String(value);
  if (Array.isArray(value)) return `${value.length} items`;
  if (isRecord(value)) return `${Object.keys(value).length} fields`;
  return String(value);
}

export function isExpandableProposalValue(value: unknown) {
  return (
    (typeof value === 'string' && value.length > 180) ||
    (typeof value === 'object' && value !== null)
  );
}

export function proposalValueDetails(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null) return JSON.stringify(value, null, 2);
  return proposalValueSummary(value);
}
