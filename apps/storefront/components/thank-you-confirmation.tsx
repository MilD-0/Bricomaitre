'use client';

import { Check, PackageCheck, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { OrderTracking } from '@/components/order-tracking';
import { StorefrontImage } from '@/components/storefront-image';
import { ThankYouContentSkeleton } from '@/components/storefront-skeletons';
import {
  SupportContactActions,
  type StorefrontSupportContact,
  type SupportContactLabels,
} from '@/components/support-contact-actions';
import type { Locale } from '@/i18n/config';
import { trackCheckoutEvent } from '@/lib/analytics';
import {
  readCheckoutConfirmation,
  writeCheckoutConfirmation,
  type CheckoutConfirmation,
} from '@/lib/checkout';
import { CheckoutOrderError, verifyCheckoutOrderByToken } from '@/lib/orders';
import { formatProductPrice } from '@/lib/product-presentation';

type Labels = {
  verifying: string;
  title: string;
  description: string;
  orderNumber: string;
  nextTitle: string;
  nextOne: string;
  nextTwo: string;
  nextThree: string;
  summary: string;
  quantity: string;
  subtotal: string;
  delivery: string;
  total: string;
  customer: string;
  phone: string;
  wilaya: string;
  commune: string;
  address: string;
  deliveryMode: string;
  homeDelivery: string;
  officeDelivery: string;
  fallback: string;
  unavailableTitle: string;
  unavailableBody: string;
  retry: string;
  browseProducts: string;
  trackingTitle: string;
  trackingLive: string;
  trackingWaiting: string;
  trackingPreparing: string;
  trackingOnWay: string;
  trackingDelivered: string;
  trackingDelayed: string;
  trackingCancelled: string;
  trackingReturned: string;
  trackingFailed: string;
};

export function ThankYouConfirmation({
  locale,
  orderId,
  token,
  labels,
  support,
  initialConfirmation = null,
}: {
  locale: Locale;
  orderId: number | null;
  token: string | null;
  labels: Labels;
  support?: { contact: StorefrontSupportContact; labels: SupportContactLabels };
  initialConfirmation?: CheckoutConfirmation | null;
}) {
  const [confirmation, setConfirmation] = useState<CheckoutConfirmation | null>(
    initialConfirmation,
  );
  const [status, setStatus] = useState<
    'loading' | 'prerendered' | 'success' | 'fallback' | 'failure'
  >(initialConfirmation ? 'prerendered' : 'loading');
  const tracked = useRef(false);

  const verify = useCallback(async () => {
    const stored = readCheckoutConfirmation(window.localStorage);
    const matches = (candidate: CheckoutConfirmation | null | undefined) =>
      candidate &&
      token &&
      candidate.order.publicToken === token &&
      (orderId == null || candidate.order.id === orderId);
    const matching = matches(stored) ? stored : null;
    const verified = matches(initialConfirmation) ? initialConfirmation : null;
    const baseline = verified
      ? {
          ...verified,
          cartMode: matching?.cartMode ?? verified.cartMode,
          purchaseEventId:
            verified.order.purchaseEventId ?? matching?.purchaseEventId ?? verified.purchaseEventId,
        }
      : matching;
    if (baseline) {
      setConfirmation(baseline);
    } else {
      setConfirmation(null);
      setStatus('loading');
    }
    if (verified && baseline) {
      writeCheckoutConfirmation(window.localStorage, baseline);
      setStatus('success');
      return;
    }
    if (!token) {
      if (!baseline) setStatus('failure');
      return;
    }
    try {
      const order = await verifyCheckoutOrderByToken(token);
      const next = {
        order,
        cartMode: baseline?.cartMode ?? ('cart' as const),
        stateName: baseline?.stateName ?? null,
        createdAt: new Date().toISOString(),
        purchaseEventId: baseline?.purchaseEventId ?? order.purchaseEventId,
      };
      writeCheckoutConfirmation(window.localStorage, next);
      setConfirmation(next);
      setStatus('success');
    } catch (error) {
      const rejected =
        error instanceof CheckoutOrderError &&
        [400, 401, 403, 404, 410].includes(error.status ?? 0);
      if (rejected) setConfirmation(null);
      setStatus(baseline && !rejected ? 'fallback' : 'failure');
      void trackCheckoutEvent(
        {
          eventName: 'order_verification_failed_after_create',
          locale,
          orderId,
          metadata: {
            cartMode: baseline?.cartMode ?? 'cart',
            itemCount:
              baseline?.order.orderProducts.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
            verificationSource: baseline ? 'snapshot' : 'server',
          },
        },
        'thank_you',
      );
    }
  }, [initialConfirmation, locale, orderId, token]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void verify(), 0);
    return () => window.clearTimeout(timeout);
  }, [verify]);

  useEffect(() => {
    if (!confirmation || status !== 'success' || tracked.current) return;
    tracked.current = true;
    const itemCount = confirmation.order.orderProducts.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );
    void trackCheckoutEvent(
      {
        eventId: confirmation.purchaseEventId ?? undefined,
        eventName: 'purchase',
        locale,
        orderId: confirmation.order.id,
        quantity: itemCount,
        value: confirmation.order.totalAmount,
        metadata: {
          cartMode: confirmation.cartMode,
          itemCount,
          verificationSource: 'server',
          items: confirmation.order.orderProducts.flatMap((item) =>
            item.productId
              ? [
                  {
                    productId: item.productId,
                    productSlug: item.slug ?? null,
                    quantity: item.quantity,
                    price: item.unitPrice,
                  },
                ]
              : [],
          ),
        },
      },
      'thank_you',
    );
  }, [confirmation, locale, status]);

  if (status === 'loading') {
    return <ThankYouContentSkeleton />;
  }

  if (
    !confirmation ||
    !token ||
    confirmation.order.publicToken !== token ||
    (orderId != null && confirmation.order.id !== orderId)
  ) {
    return (
      <main className="thank-you-page thank-you-state">
        <RotateCcw aria-hidden="true" />
        <h1>{labels.unavailableTitle}</h1>
        <p>{labels.unavailableBody}</p>
        <div>
          <button className="button button-primary" type="button" onClick={() => void verify()}>
            {labels.retry}
          </button>
          <a className="button button-secondary" href={`/${locale}/products`}>
            {labels.browseProducts}
          </a>
        </div>
      </main>
    );
  }

  const { order } = confirmation;
  return (
    <main className="thank-you-page">
      <header className="thank-you-hero">
        <span>
          <Check aria-hidden="true" />
        </span>
        <div>
          <p>
            {labels.orderNumber} #{order.id}
          </p>
          <h1>{labels.title}</h1>
          <strong>{labels.description}</strong>
        </div>
      </header>
      {status === 'fallback' ? (
        <div className="thank-you-fallback" role="status">
          {labels.fallback}
          <button type="button" onClick={() => void verify()}>
            {labels.retry}
          </button>
        </div>
      ) : null}

      <OrderTracking
        order={order}
        live={status === 'success' || status === 'prerendered'}
        labels={{
          title: labels.trackingTitle,
          live: labels.trackingLive,
          waiting: labels.trackingWaiting,
          preparing: labels.trackingPreparing,
          onWay: labels.trackingOnWay,
          delivered: labels.trackingDelivered,
          delayed: labels.trackingDelayed,
          cancelled: labels.trackingCancelled,
          returned: labels.trackingReturned,
          failed: labels.trackingFailed,
        }}
      />
      {support ? (
        <SupportContactActions
          locale={locale}
          contact={support.contact}
          labels={support.labels}
          surface="thank_you"
          variant="panel"
        />
      ) : null}

      <div className="thank-you-grid">
        <section className="thank-you-summary">
          <h2>{labels.summary}</h2>
          <ul>
            {order.orderProducts.map((item) => (
              <li key={`${item.rawValue}-${item.productId}`}>
                <span>
                  {item.thumbnailUrl ? (
                    <StorefrontImage
                      src={item.thumbnailUrl}
                      alt=""
                      width={76}
                      height={76}
                      sizes="68px"
                      quality={60}
                    />
                  ) : (
                    <PackageCheck aria-hidden="true" />
                  )}
                </span>
                <div>
                  <strong>
                    {locale === 'ar' && item.titleAr?.trim() ? item.titleAr : item.title}
                  </strong>
                  <small>
                    {labels.quantity}: {item.quantity}
                  </small>
                </div>
                <b>{formatProductPrice(String(item.lineTotal), locale)}</b>
              </li>
            ))}
          </ul>
          <dl>
            <div>
              <dt>{labels.subtotal}</dt>
              <dd>{formatProductPrice(String(order.productSubtotal), locale)}</dd>
            </div>
            <div>
              <dt>{labels.delivery}</dt>
              <dd>{formatProductPrice(String(order.deliveryFee), locale)}</dd>
            </div>
            <div>
              <dt>{labels.total}</dt>
              <dd>{formatProductPrice(String(order.totalAmount), locale)}</dd>
            </div>
          </dl>
        </section>
        <section className="thank-you-customer">
          <h2>{labels.customer}</h2>
          <dl>
            <div>
              <dt>{labels.phone}</dt>
              <dd dir="ltr">{order.phoneNumber1}</dd>
            </div>
            {confirmation.stateName ? (
              <div>
                <dt>{labels.wilaya}</dt>
                <dd>{confirmation.stateName}</dd>
              </div>
            ) : null}
            {order.city ? (
              <div>
                <dt>{labels.commune}</dt>
                <dd>{order.city}</dd>
              </div>
            ) : null}
            {order.homeAddress ? (
              <div>
                <dt>{labels.address}</dt>
                <dd>{order.homeAddress}</dd>
              </div>
            ) : null}
            <div>
              <dt>{labels.deliveryMode}</dt>
              <dd>{order.delivery === 1 ? labels.officeDelivery : labels.homeDelivery}</dd>
            </div>
          </dl>
        </section>
      </div>
      <a className="button button-primary thank-you-continue" href={`/${locale}/products`}>
        {labels.browseProducts}
      </a>
    </main>
  );
}
