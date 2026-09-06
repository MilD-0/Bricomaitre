'use client';

import { ChevronDown, ChevronRight, Menu, ShoppingCart } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { CartDrawer, type CartDrawerLabels } from '@/components/cart-drawer';
import { MobileSheet } from '@/components/mobile-sheet';
import {
  SupportContactActions,
  type StorefrontSupportContact,
  type SupportContactLabels,
} from '@/components/support-contact-actions';
import type { Locale } from '@/i18n/config';
import { trackNavigationEvent } from '@/lib/analytics';
import { getCartItemCount, getCartSubtotal, readCart, type CartItem } from '@/lib/cart';
import { prepareHaptics, triggerHaptic } from '@/lib/haptics';
import { fetchNavigationMeta, type navigationMetaSchema } from '@/lib/navigation-categories';
import { buildNavigationTaxonomy, type NavigationTaxonomyNode } from '@/lib/navigation-taxonomy';
import { formatProductPrice } from '@/lib/product-presentation';
import { getBrandPath, getCategoryPath } from '@/lib/taxonomy-routes';
import type { z } from 'zod';

type NavigationMeta = z.infer<typeof navigationMetaSchema>;
type NavigationLabels = {
  menu: string;
  closeMenu: string;
  cart: string;
  language: string;
  home: string;
  products: string;
  offers: string;
  categories: string;
  brands: string;
  cartDrawer: CartDrawerLabels;
  support: SupportContactLabels;
};

export function NavigationActions({
  locale,
  alternateLocale,
  alternateLabel,
  alternatePath,
  labels,
  contact,
}: {
  locale: Locale;
  alternateLocale: Locale;
  alternateLabel: string;
  alternatePath?: string;
  labels: NavigationLabels;
  contact: StorefrontSupportContact;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [meta, setMeta] = useState<NavigationMeta>({ categories: [], brands: [] });
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const alternateHref = `${alternatePath ?? pathname.replace(/^\/(fr|ar)(?=\/|$)/, `/${alternateLocale}`)}${searchParams.size ? `?${searchParams}` : ''}`;
  const [visualLocale, setVisualLocale] = useState<Locale>(locale);
  const cartButtonRef = useRef<HTMLButtonElement>(null);
  const cartCount = getCartItemCount(cartItems);
  const cartSubtotal = getCartSubtotal(cartItems);
  const categoryTree = useMemo(
    () =>
      buildNavigationTaxonomy(
        meta.categories.map((category) => ({
          ...category,
          label: locale === 'ar' && category.nameAr ? category.nameAr : category.name,
        })),
      ),
    [meta.categories, locale],
  );

  useEffect(() => {
    void prepareHaptics();
    queueMicrotask(() => setVisualLocale(locale));
  }, [locale]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchNavigationMeta(controller.signal)
      .then(setMeta)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const updateCart = () => setCartItems(readCart(window.localStorage));
    const openCart = () => cartButtonRef.current?.click();
    updateCart();
    window.addEventListener('bric:cart-updated', updateCart);
    window.addEventListener('storage', updateCart);
    window.addEventListener('bric:cart-open', openCart);
    return () => {
      window.removeEventListener('bric:cart-updated', updateCart);
      window.removeEventListener('storage', updateCart);
      window.removeEventListener('bric:cart-open', openCart);
    };
  }, []);

  useEffect(() => {
    const trackServerLink = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest<HTMLElement>(
        '[data-navigation-target]',
      );
      if (!link) return;
      void trackNavigationEvent({
        eventName: 'navigation_click',
        locale,
        metadata: { surface: 'header', target: link.dataset.navigationTarget },
      });
    };
    const hapticServerLink = (event: PointerEvent) => {
      const link = (event.target as Element | null)?.closest<HTMLElement>(
        '[data-navigation-target]',
      );
      if (link) void triggerHaptic('navigation');
    };
    document.addEventListener('click', trackServerLink);
    document.addEventListener('pointerdown', hapticServerLink);
    return () => {
      document.removeEventListener('click', trackServerLink);
      document.removeEventListener('pointerdown', hapticServerLink);
    };
  }, [locale]);

  function openMenu() {
    void triggerHaptic('surface');
    setMenuOpen(true);
    scheduleAfterNextPaint(() => {
      void trackNavigationEvent({
        eventName: 'navigation_menu_open',
        locale,
        metadata: { surface: 'header', target: 'mobile_drawer' },
      });
    });
  }

  function trackLocale(surface: 'header' | 'mobile_drawer') {
    void trackNavigationEvent({
      eventName: 'locale_change',
      locale,
      metadata: { surface, target: alternateLocale },
    });
  }

  function openCart(surface: 'header' | 'mobile_drawer') {
    void triggerHaptic('surface');
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
    void triggerHaptic('surface');
    setCartOpen(false);
    queueMicrotask(() => cartButtonRef.current?.focus());
  }

  function triggerNavigationHaptic() {
    void triggerHaptic('navigation');
  }

  function renderLocaleToggle(surface: 'header' | 'mobile_drawer', className = '') {
    return (
      <div
        className={`navigation-locale-toggle ${className}`.trim()}
        data-selected={visualLocale}
        role="group"
        aria-label={labels.language}
      >
        <span className="navigation-locale-indicator" aria-hidden="true" />
        {locale === 'fr' ? (
          <span className="navigation-locale-option" aria-current="true">
            FR
          </span>
        ) : (
          <a
            className="navigation-locale-option"
            href={alternateHref}
            hrefLang="fr"
            aria-label={alternateLabel}
            onPointerDown={prepareHaptics}
            onClick={() => {
              triggerNavigationHaptic();
              setVisualLocale('fr');
              trackLocale(surface);
            }}
          >
            FR
          </a>
        )}
        {locale === 'ar' ? (
          <span className="navigation-locale-option" aria-current="true">
            ع
          </span>
        ) : (
          <a
            className="navigation-locale-option"
            href={alternateHref}
            hrefLang="ar"
            aria-label={alternateLabel}
            onPointerDown={prepareHaptics}
            onClick={() => {
              triggerNavigationHaptic();
              setVisualLocale('ar');
              trackLocale(surface);
            }}
          >
            ع
          </a>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="navigation-actions">
        {renderLocaleToggle('header')}
        <button
          ref={cartButtonRef}
          className="navigation-cart"
          type="button"
          aria-label={`${labels.cart}: ${cartCount}`}
          aria-expanded={cartOpen}
          aria-controls="site-cart-drawer"
          onClick={() => openCart('header')}
        >
          <ShoppingCart aria-hidden="true" size={20} strokeWidth={1.9} />
          <span className="sr-only">{labels.cart}</span>
          <span className="navigation-cart-count" aria-hidden="true">
            {cartCount}
          </span>
        </button>
        <button
          className="navigation-menu-button"
          type="button"
          aria-label={labels.menu}
          aria-expanded={menuOpen}
          onClick={openMenu}
        >
          <Menu aria-hidden="true" size={22} strokeWidth={1.8} />
        </button>
      </div>

      {menuOpen ? (
        <MobileSheet
          title="BRICOMAITRE"
          ariaLabel={labels.menu}
          closeLabel={labels.closeMenu}
          className="navigation-drawer"
          onClose={() => setMenuOpen(false)}
          headerAction={renderLocaleToggle('mobile_drawer', 'navigation-drawer-locale-toggle')}
          footer={
            <div className="navigation-drawer-footer-content">
              <SupportContactActions
                locale={locale}
                contact={contact}
                labels={labels.support}
                surface="mobile_drawer"
                variant="drawer"
              />
              <button
                className="navigation-drawer-cart-summary"
                type="button"
                onClick={() => openCart('mobile_drawer')}
              >
                <ShoppingCart aria-hidden="true" size={20} />
                <span>
                  <strong>{labels.cart}</strong>
                  <small>{labels.cartDrawer.subtotal}</small>
                </span>
                <span>
                  {cartCount}
                  <b> · </b>
                  {formatProductPrice(String(cartSubtotal), locale)}
                </span>
              </button>
              {cartCount > 0 ? (
                <a
                  className="navigation-drawer-checkout"
                  href={`/${locale}/checkout`}
                  onClick={triggerNavigationHaptic}
                >
                  {labels.cartDrawer.checkout}
                </a>
              ) : null}
            </div>
          }
        >
          <nav className="navigation-drawer-links" aria-label={labels.menu}>
            <a
              href={`/${locale}`}
              onClick={() => {
                triggerNavigationHaptic();
                setMenuOpen(false);
              }}
            >
              {labels.home}
              <ChevronRight aria-hidden="true" size={18} />
            </a>
            <a
              href={`/${locale}/products`}
              onClick={() => {
                triggerNavigationHaptic();
                setMenuOpen(false);
              }}
            >
              {labels.products}
              <ChevronRight aria-hidden="true" size={18} />
            </a>
            <a
              href={`/${locale}/products?discounted=1`}
              onClick={() => {
                triggerNavigationHaptic();
                setMenuOpen(false);
              }}
            >
              {labels.offers}
              <ChevronRight aria-hidden="true" size={18} />
            </a>
            {meta.categories.length > 0 ? (
              <details open>
                <summary>
                  <span>{labels.categories}</span>
                  <ChevronDown aria-hidden="true" size={18} />
                </summary>
                <div>
                  {categoryTree.map((category) => (
                    <MobileCategoryGroup
                      key={category.id}
                      category={category}
                      locale={locale}
                      onNavigate={() => {
                        triggerNavigationHaptic();
                        setMenuOpen(false);
                      }}
                    />
                  ))}
                </div>
              </details>
            ) : null}
            {meta.brands.length > 0 ? (
              <LazyNavigationSection
                summary={
                  <summary>
                    <span>{labels.brands}</span>
                    <ChevronDown aria-hidden="true" size={18} />
                  </summary>
                }
                content={() => (
                  <div>
                    {meta.brands.map((brand) => (
                      <a
                        key={brand.id}
                        href={getBrandPath(locale, brand)}
                        onClick={() => {
                          triggerNavigationHaptic();
                          setMenuOpen(false);
                        }}
                      >
                        {brand.name}
                        <ChevronRight aria-hidden="true" size={18} />
                      </a>
                    ))}
                  </div>
                )}
              />
            ) : null}
          </nav>
        </MobileSheet>
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

function scheduleAfterNextPaint(callback: () => void) {
  if (typeof window.requestAnimationFrame !== 'function') {
    window.setTimeout(callback, 0);
    return;
  }

  window.requestAnimationFrame(() => window.setTimeout(callback, 0));
}

function MobileCategoryGroup({
  category,
  locale,
  onNavigate,
}: {
  category: NavigationTaxonomyNode;
  locale: Locale;
  onNavigate: () => void;
}) {
  return (
    <LazyNavigationSection
      className="navigation-drawer-category-group"
      summary={
        <summary>
          <span>{category.label}</span>
          <ChevronDown aria-hidden="true" size={18} />
        </summary>
      }
      content={() => (
        <div>
          <a
            className="navigation-drawer-category-self"
            data-category-self={category.id}
            href={getCategoryPath(locale, category)}
            onClick={onNavigate}
          >
            {category.label}
            <ChevronRight aria-hidden="true" size={18} />
          </a>
          {category.children.map((child) =>
            child.children.length > 0 ? (
              <MobileCategoryGroup
                key={child.id}
                category={child}
                locale={locale}
                onNavigate={onNavigate}
              />
            ) : (
              <a key={child.id} href={getCategoryPath(locale, child)} onClick={onNavigate}>
                {child.label}
                <ChevronRight aria-hidden="true" size={18} />
              </a>
            ),
          )}
        </div>
      )}
    />
  );
}

function LazyNavigationSection({
  summary,
  content,
  className,
}: {
  summary: ReactNode;
  content: () => ReactNode;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <details className={className} onToggle={(event) => setExpanded(event.currentTarget.open)}>
      {summary}
      {expanded ? content() : null}
    </details>
  );
}
