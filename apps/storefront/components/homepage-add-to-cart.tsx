'use client';

import { useEffect, useState } from 'react';

import type { Locale } from '@/i18n/config';
import { addCartItem, readCart, writeCart, type CartItem } from '@/lib/cart';
import { trackProductEvent } from '@/lib/analytics';
import { prepareHaptics, triggerHaptic } from '@/lib/haptics';

export function HomepageAddToCart({
  item,
  locale,
  label,
  available = true,
}: {
  item: Omit<CartItem, 'quantity'>;
  locale: Locale;
  label: string;
  available?: boolean;
}) {
  const [added, setAdded] = useState(false);
  useEffect(() => {
    void prepareHaptics();
  }, []);
  function add() {
    const next = addCartItem(readCart(window.localStorage), { ...item, quantity: 1 });
    writeCart(window.localStorage, next);
    window.dispatchEvent(new CustomEvent('bric:cart-updated', { detail: { count: next.length } }));
    setAdded(true);
    void triggerHaptic('success');
    void trackProductEvent({
      eventName: 'add_to_cart',
      locale,
      productId: item.productId,
      productSlug: item.token,
      categoryId: null,
      categorySlug: null,
      brandId: null,
      brandSlug: null,
      quantity: 1,
      value: item.unitPrice,
    });
  }
  return (
    <>
      <button className="home-editorial-add" type="button" onClick={add} disabled={!available}>
        {label}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {added ? (locale === 'ar' ? 'تمت الإضافة إلى السلة' : 'Produit ajouté au panier') : ''}
      </span>
    </>
  );
}
