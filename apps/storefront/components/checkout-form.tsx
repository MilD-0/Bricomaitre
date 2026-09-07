'use client';
import { CheckoutFormView } from './checkout/checkout-view';
import { useCheckoutForm } from './checkout/use-checkout';
export function CheckoutForm(...args: Parameters<typeof useCheckoutForm>) {
  const model = useCheckoutForm(...args);
  if (model.view === null) return model.fallback;
  return <CheckoutFormView {...model.view} />;
}
