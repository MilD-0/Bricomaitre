'use client';

import { useEffect, useState } from 'react';
import NumberFlow from '@number-flow/react';

import { Button } from '@/components/ui/button';
import type { Locale } from '@/i18n/config';
import { addCartItem, readCart, writeCart, type CartItem } from '@/lib/cart';
import { trackProductEvent } from '@/lib/analytics';
import { prepareHaptics, triggerHaptic } from '@/lib/haptics';

type ProductActionsProps = {
  locale: Locale;
  item: Omit<CartItem, 'quantity'>;
  analytics: {
    categoryId: number | null;
    categorySlug: string | null;
    brandId: number | null;
    brandSlug: string | null;
  };
  available: boolean;
  labels: {
    quantity: string;
    decrease: string;
    increase: string;
    addToCart: string;
    buyNow: string;
    added: string;
    unavailable: string;
  };
};

export function ProductActions({ locale, item, analytics, available, labels }: ProductActionsProps) {
  const [quantity, setQuantity] = useState(1);
  const [announcement, setAnnouncement] = useState('');
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
    void triggerHaptic('selection');
  }

  function addToCart() {
    try {
      const next = addCartItem(readCart(window.localStorage), { ...item, quantity });
      writeCart(window.localStorage, next);
      window.dispatchEvent(new CustomEvent('bric:cart-updated', { detail: { count: next.length } }));
      setAnnouncement(labels.added);
      void triggerHaptic('success');
    } catch {
      setAnnouncement('');
    }
    void trackProductEvent({ eventName: 'add_to_cart', ...analyticsBase });
  }

  function buyNow() {
    void triggerHaptic('medium');
    void trackProductEvent({ eventName: 'buy_now_click', ...analyticsBase });
    const params = new URLSearchParams({ product: item.token, quantity: String(quantity) });
    window.location.assign(`/${locale}/checkout?${params.toString()}`);
  }

  if (!available) {
    return <p className="product-unavailable-action">{labels.unavailable}</p>;
  }

  return (
    <div className="product-actions">
      <div className="quantity-control">
        <span id="product-quantity-label">{labels.quantity}</span>
        <div role="group" aria-labelledby="product-quantity-label">
          <Button type="button" variant="ghost" onClick={() => changeQuantity(quantity - 1)} disabled={quantity === 1} aria-label={labels.decrease}>−</Button>
          <output
            aria-live="polite"
            aria-atomic="true"
            aria-label={`${labels.quantity}: ${quantity}`}
          >
            <NumberFlow
              value={quantity}
              locales={locale}
              aria-hidden="true"
            />
          </output>
          <Button type="button" variant="ghost" onClick={() => changeQuantity(quantity + 1)} disabled={quantity === 20} aria-label={labels.increase}>+</Button>
        </div>
      </div>
      <div className="product-action-buttons">
        <Button type="button" size="lg" className="button button-primary product-buy-now" onClick={buyNow}>{labels.buyNow}</Button>
        <Button type="button" size="lg" variant="outline" className="button button-secondary product-add-to-cart" onClick={addToCart}>{labels.addToCart}</Button>
      </div>
      <p className="product-action-announcement" role="status" aria-live="polite">{announcement}</p>
    </div>
  );
}
