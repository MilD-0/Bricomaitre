'use client';

import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

import { StorefrontImage } from '@/components/storefront-image';
import type { Locale } from '@/i18n/config';
import { trackNavigationEvent } from '@/lib/analytics';
import {
  getCartSubtotal,
  removeCartItem,
  updateCartItemQuantity,
  writeCart,
  type CartItem,
} from '@/lib/cart';
import { prepareHaptics, triggerHaptic } from '@/lib/haptics';
import { isDisplayableProductImageUrl } from '@/lib/product-images';
import { formatProductPrice } from '@/lib/product-presentation';

export type CartDrawerLabels = {
  title: string;
  close: string;
  emptyTitle: string;
  emptyDescription: string;
  continueShopping: string;
  subtotal: string;
  checkout: string;
  quantity: string;
  increase: string;
  decrease: string;
  remove: string;
};

export function CartDrawer({
  locale,
  items,
  labels,
  onClose,
  onItemsChange,
}: {
  locale: Locale;
  items: CartItem[];
  labels: CartDrawerLabels;
  onClose: () => void;
  onItemsChange: (items: CartItem[]) => void;
}) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const subtotal = getCartSubtotal(items);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  function commit(next: CartItem[]) {
    try {
      writeCart(window.localStorage, next);
      onItemsChange(next);
      window.dispatchEvent(new CustomEvent('bric:cart-updated'));
    } catch {
      // Keep the current cart visible if browser storage becomes unavailable.
    }
  }

  function changeQuantity(item: CartItem, nextQuantity: number) {
    if (nextQuantity === item.quantity || nextQuantity < 1 || nextQuantity > 20) return;
    commit(updateCartItemQuantity(items, item.productId, nextQuantity));
    void triggerHaptic('control');
    void trackNavigationEvent({
      eventName: nextQuantity > item.quantity ? 'add_to_cart' : 'remove_from_cart',
      locale,
      productId: item.productId,
      productSlug: item.token,
      quantity: 1,
      value: item.unitPrice,
      metadata: { surface: 'cart_drawer', target: 'quantity' },
    });
  }

  function remove(item: CartItem) {
    commit(removeCartItem(items, item.productId));
    void triggerHaptic('destructive');
    void trackNavigationEvent({
      eventName: 'remove_from_cart',
      locale,
      productId: item.productId,
      productSlug: item.token,
      quantity: item.quantity,
      value: item.unitPrice * item.quantity,
      metadata: { surface: 'cart_drawer', target: 'remove' },
    });
  }

  function checkout() {
    void triggerHaptic('primary');
    void trackNavigationEvent({
      eventName: 'cart_checkout_click',
      locale,
      quantity: items.reduce((total, item) => total + item.quantity, 0),
      value: subtotal,
      metadata: { surface: 'cart_drawer', target: 'checkout' },
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not(:disabled)',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div className="cart-drawer-layer">
      <button
        className="cart-drawer-scrim"
        type="button"
        aria-label={labels.close}
        onClick={onClose}
      />
      <aside
        id="site-cart-drawer"
        ref={drawerRef}
        className="cart-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        onKeyDown={handleKeyDown}
      >
        <header className="cart-drawer-header">
          <div>
            <ShoppingBag aria-hidden="true" size={19} />
            <h2 id="cart-drawer-title">{labels.title}</h2>
          </div>
          <button ref={closeRef} type="button" aria-label={labels.close} onClick={onClose}>
            <X aria-hidden="true" size={21} />
          </button>
        </header>

        {items.length === 0 ? (
          <div className="cart-drawer-empty">
            <span aria-hidden="true">
              <ShoppingBag size={28} />
            </span>
            <h3>{labels.emptyTitle}</h3>
            <p>{labels.emptyDescription}</p>
            <a href={`/${locale}/products`} onClick={onClose}>
              {labels.continueShopping}
            </a>
          </div>
        ) : (
          <>
            <ul className="cart-drawer-items">
              {items.map((item) => {
                const imageUrl =
                  item.imageUrl && isDisplayableProductImageUrl(item.imageUrl)
                    ? item.imageUrl
                    : null;
                return (
                  <li key={item.productId}>
                    <a
                      className="cart-drawer-item-image"
                      href={`/${locale}/products/${encodeURIComponent(item.token)}`}
                      onClick={onClose}
                    >
                      {imageUrl ? (
                        <StorefrontImage
                          src={imageUrl}
                          alt=""
                          width={88}
                          height={88}
                          sizes="72px"
                          quality={60}
                        />
                      ) : (
                        <span aria-hidden="true">BRICO</span>
                      )}
                    </a>
                    <div className="cart-drawer-item-copy">
                      <a
                        href={`/${locale}/products/${encodeURIComponent(item.token)}`}
                        onClick={onClose}
                      >
                        {item.title}
                      </a>
                      <strong>
                        {formatProductPrice(String(item.unitPrice * item.quantity), locale)}
                      </strong>
                      <div className="cart-drawer-item-actions">
                        <div role="group" aria-label={`${labels.quantity}: ${item.title}`}>
                          <button
                            type="button"
                            aria-label={`${labels.decrease}: ${item.title}`}
                            disabled={item.quantity === 1}
                            onPointerDown={prepareHaptics}
                            onClick={() => changeQuantity(item, item.quantity - 1)}
                          >
                            <Minus aria-hidden="true" size={14} />
                          </button>
                          <output aria-label={`${labels.quantity}: ${item.quantity}`}>
                            {item.quantity}
                          </output>
                          <button
                            type="button"
                            aria-label={`${labels.increase}: ${item.title}`}
                            disabled={item.quantity === 20}
                            onPointerDown={prepareHaptics}
                            onClick={() => changeQuantity(item, item.quantity + 1)}
                          >
                            <Plus aria-hidden="true" size={14} />
                          </button>
                        </div>
                        <button
                          className="cart-drawer-remove"
                          type="button"
                          aria-label={`${labels.remove}: ${item.title}`}
                          onPointerDown={prepareHaptics}
                          onClick={() => remove(item)}
                        >
                          <Trash2 aria-hidden="true" size={16} />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <footer className="cart-drawer-footer">
              <div>
                <span>{labels.subtotal}</span>
                <strong>{formatProductPrice(String(subtotal), locale)}</strong>
              </div>
              <a href={`/${locale}/checkout`} onPointerDown={prepareHaptics} onClick={checkout}>
                {labels.checkout}
              </a>
            </footer>
          </>
        )}
      </aside>
    </div>,
    document.body,
  );
}
