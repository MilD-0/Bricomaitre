import type { ActionActor } from '../action-history';
import type {
  EcotrackBulkActionFailure,
  EcotrackBulkActionResponse,
  EcotrackDispatchBatchResponse,
  EcotrackLabelsResponse,
  EcotrackShipmentDetail,
  EcotrackShipmentsResponse,
} from '../ecotrack-admin-contracts';

export type EcotrackListLoadOptions = {
  ensureFreshVisiblePage?: boolean;
  actor?: ActionActor | null;
};

export type EcotrackOrderDetail = EcotrackShipmentDetail;

export type EcotrackRefreshFailure = EcotrackBulkActionFailure;

export type EcotrackRefreshBatchResult = EcotrackBulkActionResponse<EcotrackOrderDetail>;

export type EcotrackDispatchBatchResult = EcotrackDispatchBatchResponse;

export type EcotrackBulkLabelResult = EcotrackLabelsResponse;

export type EcotrackOrderListResponse = EcotrackShipmentsResponse;
