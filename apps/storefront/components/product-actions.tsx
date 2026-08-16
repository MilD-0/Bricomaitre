'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { ArrowUpRightIcon, type ArrowUpRightIconHandle } from '@/components/ui/arrow-up-right';
import {
  SupportContactActions,
  type SupportContactLabels,
} from '@/components/support-contact-actions';
import type { Locale } from '@/i18n/config';
import { addCartItem, readCart, writeCart, type CartItem } from '@/lib/cart';
import { trackProductEvent } from '@/lib/analytics';
import { prepareHaptics, triggerHaptic } from '@/lib/haptics';
import type { StorefrontSettingsResponse } from '@bric/storefront-core/contracts';
import { LANDING_ORDER_QUANTITY_EVENT, type LandingOrderQuantityDetail } from '@/lib/landing-order';

type ProductActionsProps = {
  locale: Locale;
  item: Omit<CartItem, 'quantity'>;
  analytics: {
    categoryId: number | null;
    categorySlug: string | null;
    brandId: number | null;
    brandSlug: string | null;
    metadata?: {
      landingPageId?: number;
      landingRevision?: number;
      landingBlockId?: string;
    };
  };
  available: boolean;
  showAddToCart?: boolean;
  buyNowTarget?: string;
  labels: {
    quantity: string;
    decrease: string;
    increase: string;
    addToCart: string;
    buyNow: string;
    added: string;
    unavailable: string;
  };
  support?: { contact: StorefrontSettingsResponse; labels: SupportContactLabels };
};

export function ProductActions({
  locale,
  item,
  analytics,
  available,
  showAddToCart = true,
  buyNowTarget,
  labels,
  support,
}: ProductActionsProps) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [announcement, setAnnouncement] = useState('');
  const buyNowIconRef = useRef<ArrowUpRightIconHandle>(null);
  const analyticsBase = {
    locale,
    productId: item.productId,
    productSlug: item.token,
    value: item.unitPrice * quantity,
    quantity,
    ...analytics,
  };

  useEffect(() => {
    if (available) void prepareHaptics();
  }, [available]);

  function changeQuantity(next: number) {
    const boundedQuantity = Math.max(1, Math.min(20, next));
    if (boundedQuantity === quantity) return;

    setQuantity(boundedQuantity);
    setAnnouncement('');
    void triggerHaptic('control');
  }

  function addToCart() {
    try {
      const next = addCartItem(readCart(window.localStorage), { ...item, quantity });
      writeCart(window.localStorage, next);
      window.dispatchEvent(
        new CustomEvent('bric:cart-updated', { detail: { count: next.length } }),
      );
      setAnnouncement(labels.added);
      void triggerHaptic('success');
    } catch {
      setAnnouncement('');
    }
    void trackProductEvent({ eventName: 'add_to_cart', ...analyticsBase });
  }

  function buyNow() {
    void triggerHaptic('primary');
    void trackProductEvent({ eventName: 'buy_now_click', ...analyticsBase });
    if (buyNowTarget) {
      window.dispatchEvent(
        new CustomEvent<LandingOrderQuantityDetail>(LANDING_ORDER_QUANTITY_EVENT, {
          detail: { productId: item.productId, quantity },
        }),
      );
      const target = document.querySelector<HTMLElement>(buyNowTarget);
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      target?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      window.history.replaceState(window.history.state, '', buyNowTarget);
      window.requestAnimationFrame(() =>
        target?.querySelector<HTMLElement>('input, select, button')?.focus({ preventScroll: true }),
      );
      return;
    }
    const params = new URLSearchParams({ product: item.token, quantity: String(quantity) });
    if (analytics.metadata?.landingPageId)
      params.set('landing', String(analytics.metadata.landingPageId));
    if (analytics.metadata?.landingRevision)
      params.set('landingRevision', String(analytics.metadata.landingRevision));
    router.push(`/${locale}/checkout?${params.toString()}`);
  }

  if (!available) {
    return <p className="product-unavailable-action">{labels.unavailable}</p>;
  }

  return (
    <div className="product-actions">
      <div className="quantity-control">
        <span id="product-quantity-label">{labels.quantity}</span>
        <div role="group" aria-labelledby="product-quantity-label">
          <Button
            type="button"
            variant="ghost"
            onClick={() => changeQuantity(quantity - 1)}
            disabled={quantity === 1}
            aria-label={labels.decrease}
          >
            −
          </Button>
          <output
            aria-live="polite"
            aria-atomic="true"
            aria-label={`${labels.quantity}: ${quantity}`}
          >
            <span aria-hidden="true">{quantity}</span>
          </output>
          <Button
            type="button"
            variant="ghost"
            onClick={() => changeQuantity(quantity + 1)}
            disabled={quantity === 20}
            aria-label={labels.increase}
          >
            +
          </Button>
        </div>
      </div>
      <div className="product-action-buttons">
        <Button
          type="button"
          size="lg"
          className="button button-primary product-buy-now"
          onPointerDown={() => buyNowIconRef.current?.startAnimation()}
          onPointerEnter={() => buyNowIconRef.current?.startAnimation()}
          onPointerLeave={() => buyNowIconRef.current?.stopAnimation()}
          onClick={buyNow}
        >
          <span>{labels.buyNow}</span>
          <ArrowUpRightIcon
            ref={buyNowIconRef}
            className="product-buy-now-icon"
            size={18}
            aria-hidden="true"
          />
        </Button>
        {showAddToCart ? (
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="button button-secondary product-add-to-cart"
            onClick={addToCart}
          >
            {labels.addToCart}
          </Button>
        ) : null}
      </div>
      <p className="product-action-announcement" role="status" aria-live="polite">
        {announcement}
      </p>
      {support ? (
        <SupportContactActions
          locale={locale}
          contact={support.contact}
          labels={support.labels}
          surface="product_detail"
        />
      ) : null}
    </div>
  );
}
