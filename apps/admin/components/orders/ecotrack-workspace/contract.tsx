'use client';
import { type ReactNode } from 'react';
import type {
  EcotrackShipmentListItem,
  EcotrackShipmentSortDirection,
  EcotrackShipmentSortKey,
} from '../../../lib/ecotrack-admin-contracts';
import { type SplitActionOption } from '../../split-action-button';

export type RowActionModel = {
  primary: {
    label: string;
    icon: ReactNode;
    onPrimaryClick: () => void | Promise<void>;
  };
  options: SplitActionOption[];
};

type Pagination = {
  page: number;
  totalPages: number;
  total: number;
};

export type OrdersEcotrackWorkspaceProps = {
  locale: string;
  items: EcotrackShipmentListItem[];
  pagination: Pagination;
  writable: boolean;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  search: string;
  scanQuery: string;
  statusFilter: string;
  staleOnly: boolean;
  sortKey: EcotrackShipmentSortKey;
  sortDirection: EcotrackShipmentSortDirection;
  statuses: readonly string[];
  selectedIds: number[];
  inspectedIds: number[];
  scanPending: boolean;
  onSearchChange: (value: string) => void;
  onScanQueryChange: (value: string) => void;
  onScanSubmit: () => void;
  onStatusChange: (value: string) => void;
  onStaleOnlyChange: (value: boolean) => void;
  onSortKeyChange: (value: EcotrackShipmentSortKey) => void;
  onSortDirectionChange: (value: EcotrackShipmentSortDirection) => void;
  onPageChange: (page: number) => void;
  onToggleSelected: (orderId: number, selected: boolean) => void;
  onToggleVisible: (selected: boolean) => void;
  onInspect: (orderId: number) => void;
  onRefreshVisible: () => void;
  onRefreshSelected: () => void;
  onPrintSelected: () => void;
  onClearSelection: () => void;
  onDispatchReady: () => void;
  onDispatchSelected: () => void;
  onShowSelectedHistory: () => void;
  buildRowActionModel: (item: EcotrackShipmentListItem, expanded: boolean) => RowActionModel;
};
