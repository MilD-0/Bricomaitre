'use client';
import { Save, Send } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { resolveEcotrackDeliveryFee } from '../../../lib/order-presentation';
import { parseNumericAmount } from '../../../lib/orders';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '../../ui/field';
import { Input } from '../../ui/input';
import { NativeSelect } from '../../ui/native-select';
import { Textarea } from '../../ui/textarea';
import {
  OrderProductsEditor,
  summarizeEditableProducts,
  type ProductSearchItem,
} from '../order-products-editor';
import {
  formatEcotrackAmountInput as formatAmountInput,
  formatEcotrackMoney as formatMoney,
} from '../orders-ecotrack-presentation';
import { updateProducts, type EditDialogProps, type EditDialogState } from './contract';

export function EcotrackEditDialog({
  state,
  catalog,
  pending,
  onChange,
  onClose,
  onSave,
}: EditDialogProps) {
  const t = useTranslations();
  const locale = useLocale();

  if (!state) return null;

  const wilayaId = Number.parseInt(state.state, 10);
  const communeOptions = Number.isInteger(wilayaId)
    ? (catalog?.communes ?? []).filter((entry) => entry.wilayaId === wilayaId)
    : [];
  const derivedSubtotal = summarizeEditableProducts(state.editableProducts).reduce(
    (sum, product) => sum + product.lineTotal,
    0,
  );
  const subtotal = parseNumericAmount(
    state.subtotalInput || (state.hasManualSubtotalOverride ? '0' : String(derivedSubtotal)),
  );
  const deliveryFee = parseNumericAmount(state.deliveryFeeInput);

  const applyDeliveryFee = (current: EditDialogState, delivery: 0 | 1, nextState: string) => ({
    ...current,
    delivery,
    state: nextState,
    deliveryFeeInput: formatAmountInput(
      resolveEcotrackDeliveryFee(
        catalog,
        delivery,
        nextState,
        parseNumericAmount(current.deliveryFeeInput),
      ),
    ),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100vh-1rem)] overflow-y-auto rounded-xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {state.mode === 'recreate'
              ? t('ordersEcotrackManager.dialogs.recreateTitle')
              : state.mode === 'finalize'
                ? t('ordersEcotrackManager.dialogs.finalizeTitle')
                : t('ordersEcotrackManager.dialogs.editTitle')}
          </DialogTitle>
          <DialogDescription>
            {state.mode === 'recreate'
              ? t('ordersEcotrackManager.dialogs.recreateDescription', { name: state.fullName })
              : state.mode === 'finalize'
                ? t('ordersEcotrackManager.dialogs.finalizeDescription', { name: state.fullName })
                : t('ordersEcotrackManager.dialogs.editDescription')}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="ecotrack-edit-first-name">
                {t('ordersEcotrackManager.fields.firstName')}
              </FieldLabel>
              <Input
                id="ecotrack-edit-first-name"
                value={state.firstName}
                onChange={(event) =>
                  onChange((current) => ({ ...current, firstName: event.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ecotrack-edit-last-name">
                {t('ordersEcotrackManager.fields.lastName')}
              </FieldLabel>
              <Input
                id="ecotrack-edit-last-name"
                value={state.lastName}
                onChange={(event) =>
                  onChange((current) => ({ ...current, lastName: event.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ecotrack-edit-phone">
                {t('ordersEcotrackManager.fields.phoneNumber1')}
              </FieldLabel>
              <Input
                id="ecotrack-edit-phone"
                value={state.phoneNumber1}
                onChange={(event) =>
                  onChange((current) => ({ ...current, phoneNumber1: event.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ecotrack-edit-phone-2">
                {t('ordersEcotrackManager.fields.phoneNumber2')}
              </FieldLabel>
              <Input
                id="ecotrack-edit-phone-2"
                value={state.phoneNumber2}
                onChange={(event) =>
                  onChange((current) => ({ ...current, phoneNumber2: event.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ecotrack-edit-delivery">
                {t('ordersEcotrackManager.fields.delivery')}
              </FieldLabel>
              <NativeSelect
                id="ecotrack-edit-delivery"
                value={String(state.delivery)}
                onChange={(event) =>
                  onChange((current) =>
                    applyDeliveryFee(
                      current,
                      Number.parseInt(event.target.value, 10) as 0 | 1,
                      current.state,
                    ),
                  )
                }
              >
                <option value="0">{t('ordersManager.delivery.home')}</option>
                <option value="1">{t('ordersManager.delivery.office')}</option>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="ecotrack-edit-state">
                {t('ordersEcotrackManager.fields.state')}
              </FieldLabel>
              <NativeSelect
                id="ecotrack-edit-state"
                value={state.state}
                onChange={(event) =>
                  onChange((current) => ({
                    ...applyDeliveryFee(current, current.delivery, event.target.value),
                    city: '',
                  }))
                }
              >
                <option value="">{t('ordersEcotrackManager.fields.statePlaceholder')}</option>
                {(catalog?.wilayas ?? []).map((wilaya) => (
                  <option key={wilaya.wilayaId} value={String(wilaya.wilayaId)}>
                    {wilaya.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
            <Field>
              <FieldLabel htmlFor="ecotrack-edit-city">
                {t('ordersEcotrackManager.fields.city')}
              </FieldLabel>
              {communeOptions.length > 0 ? (
                <NativeSelect
                  id="ecotrack-edit-city"
                  value={state.city}
                  onChange={(event) =>
                    onChange((current) => ({ ...current, city: event.target.value }))
                  }
                >
                  <option value="">{t('ordersEcotrackManager.fields.cityPlaceholder')}</option>
                  {communeOptions.map((commune) => (
                    <option key={commune.communeId} value={commune.name}>
                      {commune.name}
                    </option>
                  ))}
                </NativeSelect>
              ) : (
                <Input
                  id="ecotrack-edit-city"
                  value={state.city}
                  onChange={(event) =>
                    onChange((current) => ({ ...current, city: event.target.value }))
                  }
                />
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor="ecotrack-edit-address">
                {t('ordersEcotrackManager.fields.homeAddress')}
              </FieldLabel>
              <Input
                id="ecotrack-edit-address"
                value={state.homeAddress}
                onChange={(event) =>
                  onChange((current) => ({ ...current, homeAddress: event.target.value }))
                }
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="ecotrack-edit-note">
              {t('ordersEcotrackManager.fields.note')}
            </FieldLabel>
            <Textarea
              id="ecotrack-edit-note"
              value={state.note}
              onChange={(event) =>
                onChange((current) => ({ ...current, note: event.target.value }))
              }
            />
            <FieldDescription>{t('ordersEcotrackManager.dialogs.editHint')}</FieldDescription>
          </Field>
          <OrderProductsEditor
            customerName={state.fullName}
            items={state.editableProducts}
            search={state.search}
            onSearchChange={(value) => onChange((current) => ({ ...current, search: value }))}
            onAddProduct={(product: ProductSearchItem) =>
              onChange((current) =>
                updateProducts(current, [
                  ...current.editableProducts,
                  {
                    rawValue: String(product.id),
                    productId: product.id,
                    title: product.title,
                    unitPrice: parseNumericAmount(product.price),
                    thumbnailUrl: product.images[0] ?? null,
                    missing: false,
                  },
                ]),
              )
            }
            onIncreaseQuantity={(rawValue) =>
              onChange((current) => {
                const item = current.editableProducts.find((entry) => entry.rawValue === rawValue);
                return item
                  ? updateProducts(current, [...current.editableProducts, { ...item }])
                  : current;
              })
            }
            onDecreaseQuantity={(rawValue) =>
              onChange((current) => {
                const index = current.editableProducts.findIndex(
                  (entry) => entry.rawValue === rawValue,
                );
                return index === -1
                  ? current
                  : updateProducts(
                      current,
                      current.editableProducts.filter((_, itemIndex) => itemIndex !== index),
                    );
              })
            }
            onRemoveProduct={(rawValue) =>
              onChange((current) =>
                updateProducts(
                  current,
                  current.editableProducts.filter((entry) => entry.rawValue !== rawValue),
                ),
              )
            }
            footer={
              <div className="grid gap-4">
                <Field>
                  <FieldLabel htmlFor="ecotrack-edit-subtotal">
                    {t('ordersEcotrackManager.amounts.subtotal')}
                  </FieldLabel>
                  <Input
                    id="ecotrack-edit-subtotal"
                    type="number"
                    step="0.01"
                    value={state.subtotalInput}
                    onChange={(event) =>
                      onChange((current) => ({
                        ...current,
                        subtotalInput: event.target.value,
                        hasManualSubtotalOverride: true,
                      }))
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="ecotrack-edit-delivery-fee">
                    {t('ordersEcotrackManager.amounts.deliveryFee')}
                  </FieldLabel>
                  <Input
                    id="ecotrack-edit-delivery-fee"
                    type="number"
                    step="0.01"
                    value={state.deliveryFeeInput}
                    onChange={(event) =>
                      onChange((current) => ({
                        ...current,
                        deliveryFeeInput: event.target.value,
                      }))
                    }
                  />
                </Field>
                <div className="rounded-2xl bg-muted/40 p-3 text-sm">
                  <p>
                    {t('ordersEcotrackManager.amounts.subtotal')}: {formatMoney(locale, subtotal)}
                  </p>
                  <p>
                    {t('ordersEcotrackManager.amounts.deliveryFee')}:{' '}
                    {formatMoney(locale, deliveryFee)}
                  </p>
                  <p className="font-semibold">
                    {t('ordersEcotrackManager.amounts.total')}:{' '}
                    {formatMoney(locale, subtotal + deliveryFee)}
                  </p>
                </div>
              </div>
            }
          />
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          {state.mode === 'finalize' ? (
            <>
              <Button type="button" variant="outline" onClick={() => onSave()} disabled={pending}>
                <Save data-icon="inline-start" />
                {t('ordersEcotrackManager.actions.saveOnly')}
              </Button>
              <Button type="button" onClick={() => onSave(true)} disabled={pending}>
                <Send data-icon="inline-start" />
                {t('ordersEcotrackManager.actions.saveAndDispatch')}
              </Button>
            </>
          ) : (
            <Button type="button" onClick={() => onSave()} disabled={pending}>
              <Save data-icon="inline-start" />
              {state.mode === 'recreate'
                ? t('ordersEcotrackManager.actions.editAndRecreate')
                : t('actions.save')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
