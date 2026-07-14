'use client';

import NumberFlow from '@number-flow/react';
import { ChevronRight, Languages, Menu, ShoppingCart, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { CartDrawer, type CartDrawerLabels } from '@/components/cart-drawer';
import type { Locale } from '@/i18n/config';
import { trackNavigationEvent } from '@/lib/analytics';
import { getCartItemCount, readCart, type CartItem } from '@/lib/cart';
import { prepareHaptics, triggerHaptic } from '@/lib/haptics';
import { fetchNavigationCategories, type navigationCategoriesSchema } from '@/lib/navigation-categories';
import type { z } from 'zod';

type ApiCategory = z.infer<typeof navigationCategoriesSchema>['items'][number];
type NavigationCategory = { id: number; label: string };

type NavigationLabels = {
  menu: string;
  closeMenu: string;
  cart: string;
  language: string;
  home: string;
  products: string;
  categories: string;
  cartDrawer: CartDrawerLabels;
};

export function NavigationActions({
  locale,
  alternateLocale,
  alternateLabel,
  categories,
  labels,
}: {
  locale: Locale;
  alternateLocale: Locale;
  alternateLabel: string;
  categories: NavigationCategory[];
  labels: NavigationLabels;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [drawerCategories, setDrawerCategories] = useState(categories);
  const [alternateHref, setAlternateHref] = useState(`/${alternateLocale}`);
  const [visualLocale, setVisualLocale] = useState<Locale>(locale);
  const closeRef = useRef<HTMLButtonElement>(null);
  const cartButtonRef = useRef<HTMLButtonElement>(null);
  const cartCount = getCartItemCount(cartItems);

  useEffect(() => {
    setVisualLocale(locale);
  }, [locale]);

  useEffect(() => {
    queueMicrotask(() => setAlternateHref(`${window.location.pathname.replace(/^\/(fr|ar)(?=\/|$)/, `/${alternateLocale}`)}${window.location.search}`));
    if (categories.length > 0) return;
    const controller = new AbortController();
    void fetchNavigationCategories(controller.signal).then((items: ApiCategory[]) => setDrawerCategories(items.map((category) => ({
      id: category.id,
      label: locale === 'ar' && category.nameAr ? category.nameAr : category.name,
    })))).catch(() => undefined);
    return () => controller.abort();
  }, [alternateLocale, categories.length, locale]);

  useEffect(() => {
    const updateCart = () => setCartItems(readCart(window.localStorage));
    updateCart();
    window.addEventListener('bric:cart-updated', updateCart);
    window.addEventListener('storage', updateCart);
    return () => {
      window.removeEventListener('bric:cart-updated', updateCart);
      window.removeEventListener('storage', updateCart);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    const trackServerLink = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest<HTMLElement>('[data-navigation-target]');
      if (!link) return;
      void trackNavigationEvent({
        eventName: 'navigation_click',
        locale,
        metadata: { surface: 'header', target: link.dataset.navigationTarget },
      });
    };
    document.addEventListener('click', trackServerLink);
    return () => document.removeEventListener('click', trackServerLink);
  }, [locale]);

  function openMenu() {
    prepareHaptics();
    triggerHaptic('light');
    setMenuOpen(true);
    void trackNavigationEvent({
      eventName: 'navigation_menu_open',
      locale,
      metadata: { surface: 'header', target: 'mobile_drawer' },
    });
  }

  function trackLocale(surface: 'header' | 'mobile_drawer') {
    triggerHaptic('selection');
    void trackNavigationEvent({
      eventName: 'locale_change',
      locale,
      metadata: { surface, target: alternateLocale },
    });
  }

  function openCart(surface: 'header' | 'mobile_drawer') {
    prepareHaptics();
    triggerHaptic('selection');
    setMenuOpen(false);
    setCartOpen(true);
    void trackNavigationEvent({
      eventName: 'view_cart',
      locale,
      quantity: cartCount,
      metadata: { surface, target: 'cart_drawer' },
    });
  }

  function closeCart() {
    setCartOpen(false);
    queueMicrotask(() => cartButtonRef.current?.focus());
  }

  return (
    <>
      <div className="navigation-actions">
        <div className="navigation-locale-toggle" data-selected={visualLocale} role="group" aria-label={labels.language}>
          <span className="navigation-locale-indicator" aria-hidden="true" />
          {locale === 'fr' ? (
            <span className="navigation-locale-option" aria-current="true">FR</span>
          ) : (
            <a className="navigation-locale-option" href={alternateHref} hrefLang="fr" aria-label={alternateLabel} onPointerDown={prepareHaptics} onClick={() => { setVisualLocale('fr'); trackLocale('header'); }}>FR</a>
          )}
          {locale === 'ar' ? (
            <span className="navigation-locale-option" aria-current="true">ع</span>
          ) : (
            <a className="navigation-locale-option" href={alternateHref} hrefLang="ar" aria-label={alternateLabel} onPointerDown={prepareHaptics} onClick={() => { setVisualLocale('ar'); trackLocale('header'); }}>ع</a>
          )}
        </div>
        <button ref={cartButtonRef} className="navigation-cart" type="button" aria-label={`${labels.cart}: ${cartCount}`} aria-expanded={cartOpen} aria-controls="site-cart-drawer" onPointerDown={prepareHaptics} onClick={() => openCart('header')}>
          <ShoppingCart aria-hidden="true" size={20} strokeWidth={1.9} />
          <span>{labels.cart}</span>
          <span className="navigation-cart-count" aria-hidden="true">
            <NumberFlow value={cartCount} locales={locale} />
          </span>
        </button>
        <button className="navigation-menu-button" type="button" aria-label={labels.menu} aria-expanded={menuOpen} onPointerDown={prepareHaptics} onClick={openMenu}>
          <Menu aria-hidden="true" size={22} strokeWidth={1.8} />
        </button>
      </div>

      {menuOpen ? (
        <div className="navigation-drawer-layer">
          <button className="navigation-drawer-scrim" type="button" aria-label={labels.closeMenu} onClick={() => setMenuOpen(false)} />
          <aside className="navigation-drawer" role="dialog" aria-modal="true" aria-label={labels.menu}>
            <div className="navigation-drawer-head">
              <strong>BRICOMAITRE</strong>
              <button ref={closeRef} type="button" aria-label={labels.closeMenu} onClick={() => setMenuOpen(false)}>
                <X aria-hidden="true" size={22} />
              </button>
            </div>
            <nav aria-label={labels.menu}>
              <a href={`/${locale}`} onClick={() => setMenuOpen(false)}>
                {labels.home}<ChevronRight aria-hidden="true" size={18} />
              </a>
              <a href={`/${locale}/products`} onClick={() => setMenuOpen(false)}>
                {labels.products}<ChevronRight aria-hidden="true" size={18} />
              </a>
              {drawerCategories.length > 0 ? <p>{labels.categories}</p> : null}
              {drawerCategories.map((category) => (
                <a key={category.id} href={`/${locale}/products?category=${category.id}`} onClick={() => setMenuOpen(false)}>
                  {category.label}<ChevronRight aria-hidden="true" size={18} />
                </a>
              ))}
            </nav>
            <div className="navigation-drawer-actions">
              <button type="button" onPointerDown={prepareHaptics} onClick={() => openCart('mobile_drawer')}>
                <ShoppingCart aria-hidden="true" size={19} />
                {labels.cart}
                <NumberFlow value={cartCount} locales={locale} />
              </button>
              <a href={alternateHref} hrefLang={alternateLocale} onClick={() => trackLocale('mobile_drawer')}>
                <Languages aria-hidden="true" size={19} />
                {labels.language}: {alternateLabel}
              </a>
            </div>
          </aside>
        </div>
      ) : null}

      {cartOpen ? (
        <CartDrawer
          locale={locale}
          items={cartItems}
          labels={labels.cartDrawer}
          onClose={closeCart}
          onItemsChange={setCartItems}
        />
      ) : null}
    </>
  );
}
