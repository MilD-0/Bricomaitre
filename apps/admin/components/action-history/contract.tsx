'use client';
import type {
  ActionHistoryPreview,
  ActionHistoryQuery,
  ActionHistoryRecovery,
  toActionHistoryItem,
  toActionHistoryListItem,
} from '../../lib/action-history';
import type { PaginationMeta } from '../../lib/pagination';

export type HistoryState = ActionHistoryQuery['state'];

export type HistoryOperationFilter = ActionHistoryQuery['operation'];

export type HistoryResourceFilter = ActionHistoryQuery['resource'];

export type HistoryPreview = ActionHistoryPreview;

export type HistoryListItem = ReturnType<typeof toActionHistoryListItem>;

export type HistoryDetailItem = ReturnType<typeof toActionHistoryItem>;

export type HistoryListResponse = { items: HistoryListItem[]; pagination: PaginationMeta };

export type HistoryDetailResponse = { item: HistoryDetailItem; recovery: ActionHistoryRecovery };

export const wideLayoutQuery = '(min-width: 1280px)';

export function dayKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
