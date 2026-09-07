'use client';
import type { EcotrackCatalogResponse } from '../../../lib/ecotrack-admin-contracts';
import { summarizeEditableProducts, type EditableOrderProduct } from '../order-products-editor';
import { formatEcotrackAmountInput as formatAmountInput } from '../orders-ecotrack-presentation';

export type EditDialogState = {
  mode: 'edit' | 'recreate' | 'finalize';
  orderId: number;
  fullName: string;
  firstName: string;
  lastName: string;
  phoneNumber1: string;
  phoneNumber2: string;
  delivery: 0 | 1;
  state: string;
  city: string;
  homeAddress: string;
  note: string;
  editableProducts: EditableOrderProduct[];
  search: string;
  subtotalInput: string;
  hasManualSubtotalOverride: boolean;
  deliveryFeeInput: string;
};

export type DispatchDialogState = {
  orderIds: number[];
  label: string;
  count: number;
  askCollection: boolean;
};

export type DeleteDialogState = {
  orderId: number;
  fullName: string;
};

export type MajDialogState = {
  orderId: number;
  fullName: string;
  content: string;
};

export type EditDialogProps = {
  state: EditDialogState | null;
  catalog?: EcotrackCatalogResponse;
  pending: boolean;
  onChange: (updater: (current: EditDialogState) => EditDialogState) => void;
  onClose: () => void;
  onSave: (dispatchAfterSave?: boolean) => void;
};

export function updateProducts(current: EditDialogState, editableProducts: EditableOrderProduct[]) {
  const subtotal = summarizeEditableProducts(editableProducts).reduce(
    (sum, item) => sum + item.lineTotal,
    0,
  );
  return {
    ...current,
    editableProducts,
    subtotalInput: formatAmountInput(subtotal),
    hasManualSubtotalOverride: false,
  };
}
