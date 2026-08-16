import type { OrderRecord } from './orders';
import type { PaginationMeta } from './pagination';

export type OrdersResponse = {
  items: OrderRecord[];
  writable: boolean;
  pagination: PaginationMeta;
};

export type ProfitProjectionBasis = 'confirmed' | 'posted';

export type DailyProfitProjection = {
  basis: ProfitProjectionBasis;
  reportDay: string;
  grossProfit: number;
  adSpend: number;
  estimatedReturnRate: number;
  estimatedReturnedOrders: number;
  estimatedReturnLoss: number;
  projectedProfit: number;
  previousMonthStart: string;
  previousMonthEnd: string;
  previousMonthOrders: number;
  previousMonthNegativeOutcomeOrders: number;
};

export type DailyOrderStatusReport = {
  reportDay: string;
  newOrders: number;
  confirmationStatusChanges: number;
  confirmedToday: number;
  noAnswerOrders: number;
  adminCancelled: number;
  carrierCancelled: number;
  shipmentUpdates: number;
  profitProjection?: DailyProfitProjection;
};

export type DailyOrderStatusOverview =
  | {
      available: true;
      reportDay: string;
      timezone: string;
      reports: DailyOrderStatusReport[];
      newOrders: number;
      confirmationStatusChanges: number;
      confirmedToday: number;
      noAnswerOrders: number;
      adminCancelled: number;
      carrierCancelled: number;
      shipmentUpdates: number;
    }
  | {
      available: false;
      reportDay: string | null;
      timezone: string;
    };

export type DailyOrderStatusOverviewResponse = { overview: DailyOrderStatusOverview };
