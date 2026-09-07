'use client';
import type { EcotrackShipmentListItem } from '../../../lib/ecotrack-admin-contracts';
import { buildEditableProducts } from '../order-products-editor';
import { type EditDialogState } from '../orders-ecotrack-dialogs';
import { formatEcotrackAmountInput as formatAmountInput } from '../orders-ecotrack-presentation';
import { useShipmentQueries } from './use-shipment-queries';
export function createShipmentEditor({
  setEditDialog,
}: Pick<
  ReturnType<typeof useShipmentQueries> & Parameters<typeof useShipmentQueries>[0],
  'setEditDialog'
>) {
  const openEditDialogForItem = (item: EcotrackShipmentListItem, mode: EditDialogState['mode']) => {
    setEditDialog({
      mode,
      orderId: item.orderId,
      fullName: item.fullName,
      firstName: item.firstName ?? '',
      lastName: item.lastName ?? '',
      phoneNumber1: item.phoneNumber1,
      phoneNumber2: item.phoneNumber2 ?? '',
      delivery: item.delivery,
      state: item.state === null ? '' : String(item.state),
      city: item.city ?? '',
      homeAddress: item.homeAddress ?? '',
      note: item.note ?? '',
      editableProducts: buildEditableProducts({
        cartProducts: item.orderProducts.flatMap((product) =>
          Array.from({ length: product.quantity }, () => product.rawValue),
        ),
        orderProducts: item.orderProducts,
      }),
      search: '',
      subtotalInput: formatAmountInput(item.productSubtotal),
      hasManualSubtotalOverride: item.subtotalOverride !== null,
      deliveryFeeInput: formatAmountInput(item.deliveryFee),
    });
  };
  return { openEditDialogForItem };
}
