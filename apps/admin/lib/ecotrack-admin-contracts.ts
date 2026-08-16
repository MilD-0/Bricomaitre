import type { DeliveryType, OrderProductSummary } from './orders';
import type { PaginationMeta } from './pagination';

export type EcotrackCatalogResponse = {
  wilayas: Array<{ wilayaId: number; name: string }>;
  communes: Array<{
    communeId: number;
    wilayaId: number;
    name: string;
    postalCode: string | null;
    hasStopDesk: boolean;
  }>;
  serviceFees: Array<{
    serviceType: string;
    wilayaId: number;
    homeFee: string;
    stopDeskFee: string;
  }>;
  weightFees: Array<{
    serviceType: string;
    homeSurcharge: string;
    stopDeskSurcharge: string;
    perAdditionalKg: string;
    startsAtKg: string;
  }>;
  lastSync: Record<string, unknown> | null;
};

export type EcotrackStatusSummary = {
  currentStatus: string;
  driverPhone: string | null;
  estimatedFee: number | null;
  deskPhone: string | null;
  deskCommune: string | null;
  deskMapLink: string | null;
  deskAddress: string | null;
  lastStatusSyncedAt: string | null;
  lastTrackingSyncedAt: string | null;
  lastMajSyncedAt: string | null;
  isStatusStale: boolean;
  isTrackingStale: boolean;
  isMajStale: boolean;
};

type EcotrackMajEntry = {
  id: number;
  remarque: string;
  station: string | null;
  livreur: string | null;
  remoteCreatedAt: string;
};

type EcotrackTrackingEvent = {
  id: number;
  eventDate: string;
  eventTime: string;
  status: string;
  scanLocation: string | null;
};

export type EcotrackShipmentListItem = {
  orderId: number;
  reference: string;
  trackingNumber: string;
  provider: 'delivro' | 'emir';
  createdAt: string;
  updatedAt: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  phoneNumber1: string;
  phoneNumber2: string | null;
  delivery: DeliveryType;
  deliveryLabel: 'home' | 'office';
  state: number | null;
  stateName: string | null;
  city: string | null;
  homeAddress: string | null;
  orderProducts: OrderProductSummary[];
  subtotalOverride: number | null;
  productSubtotal: number;
  deliveryFee: number;
  totalAmount: number;
  note: string | null;
  status: EcotrackStatusSummary;
  canEdit: boolean;
  canDelete: boolean;
  canDispatch: boolean;
  canEditAndRecreate: boolean;
  canAddMaj: boolean;
  canAskReturn: boolean;
  canPrintLabel: boolean;
};

export type EcotrackShipmentDetail = EcotrackShipmentListItem & {
  majEntries: EcotrackMajEntry[];
  trackingEvents: EcotrackTrackingEvent[];
};

export type EcotrackShipmentsResponse = {
  items: EcotrackShipmentListItem[];
  writable: boolean;
  pagination: PaginationMeta;
};

export type EcotrackShipmentDetailResponse = {
  item: EcotrackShipmentDetail;
};

export type EcotrackBulkActionFailure = {
  orderId: number;
  reference: string | null;
  trackingNumber: string | null;
  message: string;
};

export type EcotrackBulkActionResponse<TItem = unknown> = {
  ok: boolean;
  items: TItem[];
  failures: EcotrackBulkActionFailure[];
  successCount: number;
  failureCount: number;
  totalRequested: number;
};

export type EcotrackRefreshBatchResponse = EcotrackBulkActionResponse<EcotrackShipmentDetail>;
export type EcotrackDispatchBatchResponse = EcotrackBulkActionResponse<EcotrackShipmentDetail>;
export type EcotrackLabelItem = {
  orderId: number;
  reference: string | null;
  trackingNumber: string;
};
export type EcotrackLabelsResponse = EcotrackBulkActionResponse<EcotrackLabelItem> & {
  fileName: string | null;
  pdfBase64: string | null;
};

export type EcotrackShipmentSortKey =
  'createdAt' | 'trackingNumber' | 'clientName' | 'currentStatus' | 'lastStatusSyncedAt';
export type EcotrackShipmentSortDirection = 'asc' | 'desc';
