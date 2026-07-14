'use client';

import NumberFlow from '@number-flow/react';
import { Check, ClipboardCheck, LoaderCircle, PackageCheck, PhoneCall, RotateCcw, Truck } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { StorefrontImage } from '@/components/storefront-image';
import type { Locale } from '@/i18n/config';
import { trackCheckoutEvent } from '@/lib/analytics';
import { readCheckoutConfirmation, writeCheckoutConfirmation, type CheckoutConfirmation } from '@/lib/checkout';
import { verifyCheckoutOrder } from '@/lib/orders';
import { formatProductPrice } from '@/lib/product-presentation';

type Labels = {
  verifying: string; title: string; description: string; orderNumber: string;
  nextTitle: string; nextOne: string; nextTwo: string; nextThree: string;
  summary: string; quantity: string; subtotal: string; delivery: string; total: string;
  customer: string; phone: string; wilaya: string; commune: string; address: string; deliveryMode: string;
  homeDelivery: string; officeDelivery: string; fallback: string; unavailableTitle: string;
  unavailableBody: string; retry: string; browseProducts: string;
};

export function ThankYouConfirmation({ locale, orderId, token, labels }: { locale: Locale; orderId: number | null; token: string | null; labels: Labels }) {
  const [confirmation, setConfirmation] = useState<CheckoutConfirmation | null>(null);
  const [status, setStatus] = useState<'loading' | 'success' | 'fallback' | 'failure'>('loading');
  const tracked = useRef(false);

  const verify = useCallback(async () => {
    const stored = readCheckoutConfirmation(window.localStorage);
    const matching = stored && (orderId == null || stored.order.id === orderId) ? stored : null;
    if (matching) {
      setConfirmation(matching);
      setStatus('fallback');
    } else {
      setStatus('loading');
    }
    if (!orderId || !token) {
      if (!matching) setStatus('failure');
      return;
    }
    try {
      const order = await verifyCheckoutOrder(orderId, token);
      const next = { order, cartMode: matching?.cartMode ?? 'cart' as const, stateName: matching?.stateName ?? null, createdAt: new Date().toISOString() };
      writeCheckoutConfirmation(window.localStorage, next);
      setConfirmation(next);
      setStatus('success');
    } catch {
      setStatus(matching ? 'fallback' : 'failure');
      void trackCheckoutEvent({
        eventName: 'order_verification_failed_after_create', locale, orderId,
        metadata: { cartMode: matching?.cartMode ?? 'cart', itemCount: matching?.order.orderProducts.reduce((sum, item) => sum + item.quantity, 0) ?? 0, verificationSource: matching ? 'snapshot' : 'server' },
      }, 'thank_you');
    }
  }, [locale, orderId, token]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void verify(), 0);
    return () => window.clearTimeout(timeout);
  }, [verify]);

  useEffect(() => {
    if (!confirmation || status !== 'success' || tracked.current) return;
    tracked.current = true;
    const itemCount = confirmation.order.orderProducts.reduce((sum, item) => sum + item.quantity, 0);
    void trackCheckoutEvent({
      eventName: 'purchase', locale, orderId: confirmation.order.id, quantity: itemCount, value: confirmation.order.totalAmount,
      metadata: { cartMode: confirmation.cartMode, itemCount, verificationSource: 'server' },
    }, 'thank_you');
  }, [confirmation, locale, status]);

  if (status === 'loading') {
    return <main className="thank-you-page thank-you-state"><LoaderCircle className="checkout-spinner" aria-hidden="true" /><h1>{labels.verifying}</h1></main>;
  }

  if (!confirmation) {
    return (
      <main className="thank-you-page thank-you-state">
        <RotateCcw aria-hidden="true" />
        <h1>{labels.unavailableTitle}</h1><p>{labels.unavailableBody}</p>
        <div><button className="button button-primary" type="button" onClick={() => void verify()}>{labels.retry}</button><a className="button button-secondary" href={`/${locale}/products`}>{labels.browseProducts}</a></div>
      </main>
    );
  }

  const { order } = confirmation;
  return (
    <main className="thank-you-page">
      <header className="thank-you-hero">
        <span><Check aria-hidden="true" /></span>
        <div><p>{labels.orderNumber} #{order.id}</p><h1>{labels.title}</h1><strong>{labels.description}</strong></div>
      </header>
      {status === 'fallback' ? <p className="thank-you-fallback" role="status">{labels.fallback}</p> : null}

      <section className="thank-you-next">
        <h2>{labels.nextTitle}</h2>
        <ol><li><PhoneCall aria-hidden="true" /><span>{labels.nextOne}</span></li><li><ClipboardCheck aria-hidden="true" /><span>{labels.nextTwo}</span></li><li><Truck aria-hidden="true" /><span>{labels.nextThree}</span></li></ol>
      </section>

      <div className="thank-you-grid">
        <section className="thank-you-summary">
          <h2>{labels.summary}</h2>
          <ul>{order.orderProducts.map((item) => <li key={`${item.rawValue}-${item.productId}`}><span>{item.thumbnailUrl ? <StorefrontImage src={item.thumbnailUrl} alt="" width={76} height={76} sizes="68px" quality={60} /> : <PackageCheck aria-hidden="true" />}</span><div><strong>{item.title}</strong><small>{labels.quantity}: {item.quantity}</small></div><b>{formatProductPrice(String(item.lineTotal), locale)}</b></li>)}</ul>
          <dl><div><dt>{labels.subtotal}</dt><dd>{formatProductPrice(String(order.productSubtotal), locale)}</dd></div><div><dt>{labels.delivery}</dt><dd>{formatProductPrice(String(order.deliveryFee), locale)}</dd></div><div><dt>{labels.total}</dt><dd><NumberFlow value={order.totalAmount} locales={locale} format={{ style: 'currency', currency: 'DZD', maximumFractionDigits: 0 }} /></dd></div></dl>
        </section>
        <section className="thank-you-customer">
          <h2>{labels.customer}</h2>
          <dl><div><dt>{labels.phone}</dt><dd dir="ltr">{order.phoneNumber1}</dd></div>{confirmation.stateName ? <div><dt>{labels.wilaya}</dt><dd>{confirmation.stateName}</dd></div> : null}{order.city ? <div><dt>{labels.commune}</dt><dd>{order.city}</dd></div> : null}{order.homeAddress ? <div><dt>{labels.address}</dt><dd>{order.homeAddress}</dd></div> : null}<div><dt>{labels.deliveryMode}</dt><dd>{order.delivery === 1 ? labels.officeDelivery : labels.homeDelivery}</dd></div></dl>
        </section>
      </div>
      <a className="button button-primary thank-you-continue" href={`/${locale}/products`}>{labels.browseProducts}</a>
    </main>
  );
}
