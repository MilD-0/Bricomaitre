'use client';
import { useCheckoutState } from './use-checkout-state';

import type { StorefrontEcotrackCatalogResponse } from '@bric/storefront-core/contracts';
import { PackageCheck } from 'lucide-react';
import { useEffect, useMemo, type FormEvent } from 'react';

import { CheckoutContentSkeleton } from '@/components/storefront-skeletons';
import {
  type StorefrontSupportContact,
  type SupportContactLabels,
} from '@/components/support-contact-actions';
import type { Locale } from '@/i18n/config';
import { getAnalyticsIdentity, trackCheckoutEvent } from '@/lib/analytics';
import {
  consumeOrderedCartItems,
  getCartProductPromos,
  mergeCartValidation,
  readCart,
  reconcileCartWithCatalog,
  STOREFRONT_CART_KEY,
  writeCart,
  type CartItem,
} from '@/lib/cart';
import {
  buildCheckoutOrderPayload,
  checkoutFormSchema,
  clearPendingCheckout,
  expandCheckoutCart,
  getCheckoutCommunes,
  getCheckoutDeliveryFee,
  hasCheckoutStopDesk,
  writeCheckoutConfirmation,
  writeCheckoutDraft,
  writePendingCheckout,
  type PendingCheckout,
} from '@/lib/checkout';
import type { CheckoutLabels } from '@/lib/checkout-labels';
import { triggerHaptic } from '@/lib/haptics';
import { getMarketingOrderContext } from '@/lib/marketing-attribution';
import { CheckoutOrderError, createCheckoutOrder } from '@/lib/orders';

function createId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export function useCheckoutForm({
  locale,
  catalog,
  directItem,
  landingAttribution,
  embedded = false,
  initialNotice,
  labels,
  support,
}: {
  locale: Locale;
  catalog: StorefrontEcotrackCatalogResponse;
  directItem: CartItem | null;
  landingAttribution?: { landingPageId: number; landingRevision: number };
  embedded?: boolean;
  initialNotice?: string;
  labels: CheckoutLabels;
  support?: { contact: StorefrontSupportContact; labels: SupportContactLabels };
}) {
  const {
    cartMode,
    pending,
    busy,
    setItems,
    setRequestError,
    hydrated,
    phoneNumber1,
    lastName,
    firstName,
    state,
    city,
    homeAddress,
    email,
    delivery,
    items,
    viewedRef,
    setDelivery,
    setErrors,
    submitIconRef,
    submissionLockRef,
    setSubmitting,
    setPending,
    router,
    setCity,
    setRetryAt,
    validationLockRef,
    retryBlocked,
    focusInvalidRef,
    setValidating,
    requestError,
    formRef,
    errors,
    setPhoneNumber1,
    setLastName,
    setFirstName,
    setState,
    setHomeAddress,
    setEmail,
  } = useCheckoutState({
    locale,
    catalog,
    directItem,
    landingAttribution,
    embedded,
    initialNotice,
    labels,
    support,
  });

  useEffect(() => {
    if (cartMode === 'direct' || pending || busy) return;
    const updateCart = () => {
      setItems(readCart(window.localStorage));
      setRequestError('');
    };
    window.addEventListener('bric:cart-updated', updateCart);
    window.addEventListener('storage', updateCart);
    return () => {
      window.removeEventListener('bric:cart-updated', updateCart);
      window.removeEventListener('storage', updateCart);
    };
  }, [cartMode, pending, busy, setItems, setRequestError]);

  useEffect(() => {
    if (!hydrated) return;
    writeCheckoutDraft(window.localStorage, {
      phoneNumber1,
      lastName,
      firstName,
      state,
      city,
      homeAddress,
      email,
      delivery,
    });
  }, [city, delivery, email, firstName, homeAddress, hydrated, lastName, phoneNumber1, state]);

  const communes = useMemo(() => getCheckoutCommunes(catalog, state), [catalog, state]);
  const officeAvailable = hasCheckoutStopDesk(catalog, state);
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const deliveryFee = pending?.deliveryFee ?? getCheckoutDeliveryFee(catalog, state, delivery);
  const total = subtotal + deliveryFee;
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    if (viewedRef.current || !hydrated || itemCount === 0) return;
    viewedRef.current = true;
    void trackCheckoutEvent({
      eventName: 'begin_checkout',
      locale,
      quantity: itemCount,
      value: total,
      metadata: {
        cartMode,
        itemCount,
        items: items.map((item) => ({
          productId: item.productId,
          productSlug: item.token,
          quantity: item.quantity,
          price: item.unitPrice,
        })),
        ...landingAttribution,
      },
    });
  }, [cartMode, hydrated, itemCount, items, landingAttribution, locale, total, viewedRef]);

  function chooseDelivery(next: 'home' | 'office') {
    if (next === 'office' && !officeAvailable) return;
    setDelivery(next);
    if (next === 'office') {
      setErrors((current) => {
        const remaining = { ...current };
        delete remaining.homeAddress;
        return remaining;
      });
    }
    setRequestError('');
    void triggerHaptic('control');
  }

  function startSubmitIconAnimation() {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    submitIconRef.current?.startAnimation();
  }

  async function completeSubmission(attempt: PendingCheckout) {
    if (submissionLockRef.current || (attempt.retryAt ?? 0) > Date.now()) return;
    submissionLockRef.current = true;
    setSubmitting(true);
    setRequestError('');
    try {
      const order = await createCheckoutOrder(attempt.payload, attempt.idempotencyKey);
      const stateName =
        catalog.wilayas.find((wilaya) => wilaya.wilayaId === order.state)?.name ?? null;
      writeCheckoutConfirmation(window.localStorage, {
        order,
        cartMode,
        stateName,
        createdAt: new Date().toISOString(),
        purchaseEventId: order.purchaseEventId ?? attempt.payload.marketing?.eventId ?? null,
      });
      clearPendingCheckout(window.localStorage);
      try {
        if (attempt.cartMode === 'cart') {
          const remaining = consumeOrderedCartItems(
            readCart(window.localStorage),
            order.orderProducts,
          );
          if (remaining.length) writeCart(window.localStorage, remaining);
          else window.localStorage.removeItem(STOREFRONT_CART_KEY);
        }
      } catch {
        // The committed order must still succeed when browser storage is unavailable.
      }
      window.dispatchEvent(new CustomEvent('bric:cart-updated'));
      setPending(null);
      void triggerHaptic('success');
      void trackCheckoutEvent({
        eventName: 'order_create_success',
        locale,
        orderId: order.id,
        quantity: itemCount,
        value: order.totalAmount,
        metadata: { cartMode, itemCount, delivery, ...landingAttribution },
      });
      router.push(`/${locale}/thank-you?token=${encodeURIComponent(order.publicToken!)}`);
    } catch (error) {
      const code = error instanceof CheckoutOrderError ? error.code : 'request_failed';
      if (code === 'cart_changed' || code === 'validation') {
        clearPendingCheckout(window.localStorage);
        setPending(null);
        if (delivery === 'office' && !officeAvailable) setDelivery('home');
        if (city && !communes.some((commune) => commune.name === city)) setCity('');
        try {
          const snapshot = cartMode === 'cart' ? readCart(window.localStorage) : items;
          const reconciled = await reconcileCartWithCatalog(snapshot, fetch, locale);
          const merged =
            cartMode === 'cart'
              ? mergeCartValidation(readCart(window.localStorage), snapshot, reconciled.items)
              : reconciled.items;
          setItems(merged);
          if (cartMode === 'cart') writeCart(window.localStorage, merged);
          window.dispatchEvent(new CustomEvent('bric:cart-updated'));
        } catch {
          // A fresh submit will validate again before creating another attempt.
        }
        setRequestError(code === 'cart_changed' ? labels.cartUpdated : labels.submitError);
      } else {
        const nextAttempt = {
          ...attempt,
          ...(error instanceof CheckoutOrderError && error.retryAfterSeconds !== null
            ? {
                retryAt: Date.now() + Math.max(1, error.retryAfterSeconds) * 1000,
                retryReason:
                  code === 'rate_limit' ? ('rate_limit' as const) : ('processing' as const),
              }
            : {}),
        };
        writePendingCheckout(window.localStorage, nextAttempt);
        setPending(nextAttempt);
        setRetryAt(nextAttempt.retryAt ?? 0);
        setRequestError(code === 'rate_limit' ? labels.rateLimit : labels.submitError);
      }
      void triggerHaptic('error');
      void trackCheckoutEvent({
        eventName: 'order_create_failed',
        locale,
        quantity: itemCount,
        value: total,
        metadata: { cartMode, itemCount, delivery, failureCode: code, ...landingAttribution },
      });
    } finally {
      submissionLockRef.current = false;
      setSubmitting(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hydrated || busy || validationLockRef.current || retryBlocked) return;
    if (pending) {
      await completeSubmission(pending);
      return;
    }
    if (items.length === 0) return;
    if (items.reduce((sum, item) => sum + item.quantity, 0) > 50) {
      setRequestError(labels.quantityLimit);
      return;
    }
    const parsed = checkoutFormSchema.safeParse({
      phoneNumber1,
      lastName,
      firstName,
      state,
      city,
      homeAddress,
      email,
      delivery,
    });
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? 'form');
        nextErrors[field] =
          issue.message === 'invalid_email'
            ? labels.emailError
            : issue.message === 'phone_invalid'
              ? labels.phoneError
              : labels.requiredError;
      }
      focusInvalidRef.current = true;
      setErrors(nextErrors);
      setRequestError('');
      return;
    }
    setErrors({});
    validationLockRef.current = true;
    setValidating(true);
    setRequestError('');
    try {
      const reconciled = await reconcileCartWithCatalog(items, fetch, locale);
      const validatedItems = reconciled.items;
      if (reconciled.changed) {
        const merged =
          cartMode === 'cart'
            ? mergeCartValidation(readCart(window.localStorage), items, reconciled.items)
            : reconciled.items;
        setItems(merged);
        if (cartMode === 'cart') writeCart(window.localStorage, merged);
        window.dispatchEvent(new CustomEvent('bric:cart-updated'));
        if (reconciled.requiresReview) {
          setRequestError(labels.cartUpdated);
          return;
        }
      }
      const purchaseEventId = createId();
      let attribution: Pick<
        Parameters<typeof buildCheckoutOrderPayload>[0],
        'visitId' | 'journeyId' | 'sessionId' | 'marketing'
      > = { visitId: null, journeyId: null, sessionId: null };
      try {
        attribution = {
          ...getAnalyticsIdentity(),
          marketing: getMarketingOrderContext(purchaseEventId),
        };
      } catch {
        // Optional attribution must never prevent a customer from ordering.
      }
      const payload = buildCheckoutOrderPayload({
        form: parsed.data,
        cartProducts: expandCheckoutCart(validatedItems),
        productPromos: getCartProductPromos(validatedItems),
        expectedProductSubtotal: validatedItems.reduce(
          (sum, item) => sum + item.unitPrice * item.quantity,
          0,
        ),
        ...attribution,
      });
      const attempt = {
        idempotencyKey: createId(),
        payload,
        items: validatedItems,
        cartMode,
        deliveryFee,
        createdAt: new Date().toISOString(),
      };
      writePendingCheckout(window.localStorage, attempt);
      setPending(attempt);
      void triggerHaptic('primary');
      void trackCheckoutEvent({
        eventName: 'checkout_submit_attempt',
        locale,
        quantity: itemCount,
        value: total,
        metadata: { cartMode, itemCount, delivery, ...landingAttribution },
      });
      await completeSubmission(attempt);
    } catch {
      setRequestError(labels.submitError);
    } finally {
      validationLockRef.current = false;
      setValidating(false);
    }
  }

  if (!hydrated && !directItem) return { view: null, fallback: <CheckoutContentSkeleton /> };

  if (hydrated && items.length === 0 && !pending) {
    return {
      view: null,
      fallback: (
        <div className="checkout-page checkout-empty">
          <PackageCheck aria-hidden="true" />
          <h1>{labels.emptyTitle}</h1>
          <p>{labels.emptyBody}</p>
          <a className="button button-primary" href={`/${locale}/products`}>
            {labels.browseProducts}
          </a>
        </div>
      ),
    };
  }

  const Root = embedded ? 'section' : 'div';
  const Heading = embedded ? 'h2' : 'h1';

  return {
    view: {
      Root,
      embedded,
      Heading,
      labels,
      pending,
      requestError,
      completeSubmission,
      busy,
      retryBlocked,
      support,
      locale,
      formRef,
      submit,
      phoneNumber1,
      errors,
      setPhoneNumber1,
      setErrors,
      lastName,
      setLastName,
      firstName,
      setFirstName,
      state,
      setState,
      setCity,
      delivery,
      setDelivery,
      catalog,
      city,
      communes,
      homeAddress,
      setHomeAddress,
      email,
      setEmail,
      chooseDelivery,
      officeAvailable,
      items,
      subtotal,
      deliveryFee,
      total,
      itemCount,
      hydrated,
      startSubmitIconAnimation,
      submitIconRef,
    } as const,
    fallback: null,
  };
}
