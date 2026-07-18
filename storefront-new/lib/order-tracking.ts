import type { StorefrontOrderResponseItem } from '@bric/storefront-core/contracts';

export const customerOrderTrackingStages = ['waiting', 'preparing', 'onWay', 'delivered'] as const;
export type CustomerOrderTrackingStage = (typeof customerOrderTrackingStages)[number];
export type CustomerOrderTrackingVariant = 'progress' | 'delayed' | 'cancelled' | 'returned' | 'failed';

export function getCustomerOrderTrackingState(
  status: StorefrontOrderResponseItem['confirmed'],
): { activeStage: number; current: CustomerOrderTrackingStage; variant: CustomerOrderTrackingVariant } {
  switch (status) {
    case 2:
    case 11:
      return { activeStage: 1, current: 'preparing', variant: 'progress' };
    case 3:
    case 7:
      return { activeStage: 2, current: 'onWay', variant: 'progress' };
    case 4:
    case 10:
      return { activeStage: 3, current: 'delivered', variant: 'progress' };
    case 5:
      return { activeStage: 2, current: 'onWay', variant: 'delayed' };
    case 6:
      return { activeStage: 0, current: 'waiting', variant: 'cancelled' };
    case 8:
      return { activeStage: 3, current: 'delivered', variant: 'returned' };
    case 9:
      return { activeStage: 2, current: 'onWay', variant: 'failed' };
    case 0:
    case 1:
    default:
      return { activeStage: 0, current: 'waiting', variant: 'progress' };
  }
}
