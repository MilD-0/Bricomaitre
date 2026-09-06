'use client';

import type { StorefrontEcotrackCatalogResponse } from '@bric/storefront-core/contracts';
import {
  ArrowRight,
  Check,
  LoaderCircle,
  MapPin,
  PackageCheck,
  PhoneCall,
  RotateCcw,
  Truck,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { StorefrontImage } from '@/components/storefront-image';
import { CheckoutContentSkeleton } from '@/components/storefront-skeletons';
import {
  SupportContactActions,
  type StorefrontSupportContact,
  type SupportContactLabels,
} from '@/components/support-contact-actions';
import { ShieldCheckIcon, type ShieldCheckIconHandle } from '@/components/ui/shield-check';
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
  readCheckoutDraft,
  readPendingCheckout,
  writeCheckoutConfirmation,
  writeCheckoutDraft,
  writePendingCheckout,
  type PendingCheckout,
} from '@/lib/checkout';
import type { CheckoutLabels } from '@/lib/checkout-labels';
import { prepareHaptics, triggerHaptic } from '@/lib/haptics';
import {
  LANDING_ORDER_QUANTITY_EVENT,
  LANDING_ORDER_SECTION_ID,
  type LandingOrderQuantityDetail,
} from '@/lib/landing-order';
import { getMarketingOrderContext } from '@/lib/marketing-attribution';
import { CheckoutOrderError, createCheckoutOrder } from '@/lib/orders';
import { formatProductPrice } from '@/lib/product-presentation';

function createId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export function CheckoutForm({
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
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>(directItem ? [directItem] : []);
  const [hydrated, setHydrated] = useState(false);
  const [phoneNumber1, setPhoneNumber1] = useState('');
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [state, setState] = useState<number | null>(null);
  const [city, setCity] = useState('');
  const [homeAddress, setHomeAddress] = useState('');
  const [email, setEmail] = useState('');
  const [delivery, setDelivery] = useState<'home' | 'office'>('home');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [requestError, setRequestError] = useState(initialNotice ?? '');
  const [pending, setPending] = useState<PendingCheckout | null>(null);
  const [cartMode, setCartMode] = useState<'cart' | 'direct'>(directItem ? 'direct' : 'cart');
  const [submitting, setSubmitting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const busy = validating || submitting;
  const retryBlocked = retryAt > 0;
  const submissionLock = useRef(false);
  const validationLock = useRef(false);
  const submitIconRef = useRef<ShieldCheckIconHandle>(null);
  const viewed = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const focusInvalid = useRef(false);
  useEffect(() => {
    if (!focusInvalid.current || busy) return;
    const field = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (field) {
      focusInvalid.current = false;
      field.focus();
    }
  }, [errors, busy]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- Checkout persistence must hydrate before the customer can submit the form. */
    const savedAttempt = readPendingCheckout(window.localStorage);
    setCartMode(savedAttempt?.cartMode ?? (directItem ? 'direct' : 'cart'));
    if (savedAttempt) setItems(savedAttempt.items ?? []);
    if (!directItem && !savedAttempt) {
      const storedItems = readCart(window.localStorage);
      setItems(storedItems);
      void reconcileCartWithCatalog(storedItems, fetch, locale)
        .then((reconciled) => {
          if (!reconciled.changed) return;
          const merged = mergeCartValidation(
            readCart(window.localStorage),
            storedItems,
            reconciled.items,
          );
          setItems(merged);
          writeCart(window.localStorage, merged);
          window.dispatchEvent(new CustomEvent('bric:cart-updated'));
          setRequestError(labels.cartUpdated);
        })
        .catch(() => undefined);
    }
    const savedDraft = readCheckoutDraft(window.localStorage);
    const restored = savedAttempt
      ? {
          phoneNumber1: savedAttempt.payload.phoneNumber1,
          lastName: savedAttempt.payload.lastName ?? '',
          firstName: savedAttempt.payload.firstName ?? '',
          state: savedAttempt.payload.state,
          city: savedAttempt.payload.city ?? '',
          homeAddress: savedAttempt.payload.homeAddress ?? '',
          email: savedAttempt.payload.email ?? '',
          delivery: savedAttempt.payload.delivery === 1 ? ('office' as const) : ('home' as const),
        }
      : savedDraft;
    if (restored) {
      const validCity =
        restored.state != null &&
        catalog.communes.some(
          (commune) => commune.wilayaId === restored.state && commune.name === restored.city,
        );
      const officeAvailableForDraft =
        restored.state != null &&
        catalog.communes.some(
          (commune) => commune.wilayaId === restored.state && commune.hasStopDesk,
        );
      setPhoneNumber1(restored.phoneNumber1);
      setLastName(restored.lastName);
      setFirstName(restored.firstName);
      setState(restored.state);
      setCity(savedAttempt || validCity ? restored.city : '');
      setHomeAddress(restored.homeAddress);
      setEmail(restored.email);
      setDelivery(
        savedAttempt
          ? restored.delivery
          : restored.delivery === 'office' && officeAvailableForDraft
            ? 'office'
            : 'home',
      );
    } else {
      try {
        const estimate = JSON.parse(
          window.localStorage.getItem('bric:cart:delivery-estimate:v1') ?? 'null',
        ) as { wilayaId?: unknown; delivery?: unknown } | null;
        const estimatedState = Number(estimate?.wilayaId);
        if (Number.isInteger(estimatedState) && estimatedState > 0) {
          setState(estimatedState);
          setDelivery(
            estimate?.delivery === 'office' && hasCheckoutStopDesk(catalog, estimatedState)
              ? 'office'
              : 'home',
          );
        }
      } catch {
        try {
          window.localStorage.removeItem('bric:cart:delivery-estimate:v1');
        } catch {
          // Delivery estimates are optional browser state.
        }
      }
    }
    setPending(savedAttempt);
    if (savedAttempt) {
      setRetryAt((savedAttempt.retryAt ?? 0) > Date.now() ? savedAttempt.retryAt! : 0);
      setRequestError(
        (savedAttempt.retryAt ?? 0) > Date.now() && savedAttempt.retryReason === 'rate_limit'
          ? labels.rateLimit
          : labels.submitError,
      );
    }
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    void prepareHaptics();
  }, [catalog, directItem, labels.cartUpdated, labels.submitError, labels.rateLimit, locale]);

  useEffect(() => {
    if (!retryAt) return;
    const timer = window.setTimeout(() => setRetryAt(0), Math.max(0, retryAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [retryAt]);

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
  }, [cartMode, pending, busy]);

  useEffect(() => {
    if (!embedded || !directItem) return;
    const updateQuantity = (event: Event) => {
      const detail = (event as CustomEvent<LandingOrderQuantityDetail>).detail;
      if (!detail || detail.productId !== directItem.productId || pending || busy) return;
      const quantity = Math.max(1, Math.min(20, detail.quantity));
      setItems((current) =>
        current.map((item) => (item.productId === detail.productId ? { ...item, quantity } : item)),
      );
    };
    window.addEventListener(LANDING_ORDER_QUANTITY_EVENT, updateQuantity);
    return () => window.removeEventListener(LANDING_ORDER_QUANTITY_EVENT, updateQuantity);
  }, [directItem, embedded, pending, busy]);

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
    if (viewed.current || !hydrated || itemCount === 0) return;
    viewed.current = true;
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
  }, [cartMode, hydrated, itemCount, items, landingAttribution, locale, total]);

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
    if (submissionLock.current || (attempt.retryAt ?? 0) > Date.now()) return;
    submissionLock.current = true;
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
        purchaseEventId: attempt.payload.marketing?.eventId ?? null,
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
      submissionLock.current = false;
      setSubmitting(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hydrated || busy || validationLock.current || retryBlocked) return;
    if (pending) {
      await completeSubmission(pending);
      return;
    }
    if (items.length === 0) return;
    if (items.reduce((sum, item) => sum + item.quantity, 0) > 50) {
      setRequestError(labels.quantityLimit);
      return;
    }
    validationLock.current = true;
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
        focusInvalid.current = true;
        setErrors(nextErrors);
        setRequestError('');
        return;
      }
      setErrors({});
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
      validationLock.current = false;
      setValidating(false);
    }
  }

  if (!hydrated && !directItem) return <CheckoutContentSkeleton />;

  if (hydrated && items.length === 0 && !pending) {
    return (
      <main className="checkout-page checkout-empty">
        <PackageCheck aria-hidden="true" />
        <h1>{labels.emptyTitle}</h1>
        <p>{labels.emptyBody}</p>
        <a className="button button-primary" href={`/${locale}/products`}>
          {labels.browseProducts}
        </a>
      </main>
    );
  }

  const Root = embedded ? 'section' : 'div';
  const Heading = embedded ? 'h2' : 'h1';

  return (
    <Root
      id={embedded ? LANDING_ORDER_SECTION_ID : undefined}
      className={`checkout-page${embedded ? ' landing-order-section' : ''}`}
    >
      <header className="checkout-heading">
        <Heading>{labels.title}</Heading>
        <span>{labels.description}</span>
      </header>

      {pending && requestError ? (
        <section className="checkout-recovery" role="alert">
          <RotateCcw aria-hidden="true" />
          <div>
            <strong>{labels.savedAttempt}</strong>
            <p>{requestError}</p>
          </div>
          <button
            type="button"
            onClick={() => void completeSubmission(pending)}
            disabled={busy || retryBlocked}
          >
            {labels.retry}
          </button>
          {support ? (
            <SupportContactActions
              locale={locale}
              contact={support.contact}
              labels={support.labels}
              surface="checkout"
              variant="recovery"
            />
          ) : null}
        </section>
      ) : null}

      <form ref={formRef} className="checkout-layout" onSubmit={submit} aria-busy={busy} noValidate>
        <fieldset
          className="checkout-form-panel"
          aria-label={labels.title}
          disabled={Boolean(pending) || busy}
          style={{ border: 0, margin: 0, minWidth: 0 }}
        >
          <div className="checkout-fields">
            <label className="checkout-field checkout-field-phone">
              <span>
                {labels.phone} <b>*</b>
              </span>
              <input
                name="phoneNumber1"
                type="tel"
                dir="ltr"
                inputMode="tel"
                autoComplete="tel"
                value={phoneNumber1}
                placeholder={labels.phonePlaceholder}
                aria-invalid={Boolean(errors.phoneNumber1)}
                aria-describedby={errors.phoneNumber1 ? 'phone-error' : undefined}
                onChange={(event) => {
                  setPhoneNumber1(event.target.value);
                  setErrors((current) => {
                    if (!current.phoneNumber1) return current;
                    const next = { ...current };
                    delete next.phoneNumber1;
                    return next;
                  });
                }}
              />
              {errors.phoneNumber1 ? <small id="phone-error">{errors.phoneNumber1}</small> : null}
            </label>
            <label className="checkout-field">
              <span>
                {labels.lastName} <em>{labels.optional}</em>
              </span>
              <input
                name="lastName"
                autoComplete="family-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />
            </label>
            <label className="checkout-field">
              <span>
                {labels.firstName} <em>{labels.optional}</em>
              </span>
              <input
                name="firstName"
                autoComplete="given-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
              />
            </label>
            <label className="checkout-field">
              <span>
                {labels.wilaya} <b>*</b>
              </span>
              <select
                name="state"
                value={state ?? ''}
                aria-invalid={Boolean(errors.state)}
                onChange={(event) => {
                  setState(event.target.value ? Number(event.target.value) : null);
                  setCity('');
                  if (delivery === 'office') setDelivery('home');
                }}
              >
                <option value="">{labels.wilaya}</option>
                {catalog.wilayas.map((wilaya) => (
                  <option key={wilaya.wilayaId} value={wilaya.wilayaId}>
                    {wilaya.wilayaId}. {wilaya.name}
                  </option>
                ))}
              </select>
              {errors.state ? <small>{errors.state}</small> : null}
            </label>
            <label className="checkout-field">
              <span>
                {labels.commune} <b>*</b>
              </span>
              <select
                name="city"
                value={city}
                aria-disabled={state == null}
                aria-invalid={Boolean(errors.city)}
                onChange={(event) => setCity(event.target.value)}
              >
                <option value="">{labels.commune}</option>
                {pending && city && !communes.some((commune) => commune.name === city) ? (
                  <option value={city}>{city}</option>
                ) : null}
                {communes.map((commune) => (
                  <option key={commune.communeId} value={commune.name}>
                    {commune.name}
                    {commune.hasStopDesk ? ' •' : ''}
                  </option>
                ))}
              </select>
              {errors.city ? <small>{errors.city}</small> : null}
            </label>
            <label className="checkout-field checkout-field-wide">
              <span>
                {labels.address} <em>{labels.optional}</em>
              </span>
              <input
                name="homeAddress"
                autoComplete="street-address"
                value={homeAddress}
                aria-invalid={Boolean(errors.homeAddress)}
                aria-describedby={errors.homeAddress ? 'address-error' : undefined}
                onChange={(event) => setHomeAddress(event.target.value)}
              />
              {errors.homeAddress ? <small id="address-error">{errors.homeAddress}</small> : null}
            </label>
            <label className="checkout-field checkout-field-wide">
              <span>
                {labels.email} <em>{labels.optional}</em>
              </span>
              <input
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                aria-invalid={Boolean(errors.email)}
                onChange={(event) => setEmail(event.target.value)}
              />
              {errors.email ? <small>{errors.email}</small> : null}
            </label>
          </div>

          <fieldset className="checkout-delivery">
            <legend>{labels.deliveryMode}</legend>
            <button
              type="button"
              aria-pressed={delivery === 'home'}
              onClick={() => chooseDelivery('home')}
            >
              <Truck aria-hidden="true" />
              <span>
                <strong>{labels.homeDelivery}</strong>
              </span>
              <Check aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-pressed={delivery === 'office'}
              aria-disabled={!officeAvailable}
              onClick={() => chooseDelivery('office')}
            >
              <MapPin aria-hidden="true" />
              <span>
                <strong>{labels.officeDelivery}</strong>
                {!officeAvailable && state ? <small>{labels.officeUnavailable}</small> : null}
              </span>
              <Check aria-hidden="true" />
            </button>
          </fieldset>
        </fieldset>

        <aside className="checkout-summary">
          <h2>{labels.orderSummary}</h2>
          {pending && !pending.items ? (
            <p>
              {labels.savedAttempt} · {labels.quantity}: {pending.payload.cartProducts.length}
            </p>
          ) : (
            <>
              <ul>
                {items.map((item) => (
                  <li key={item.productId}>
                    <span className="checkout-summary-image">
                      {item.imageUrl ? (
                        <StorefrontImage
                          src={item.imageUrl}
                          alt=""
                          width={72}
                          height={72}
                          sizes="64px"
                          quality={60}
                        />
                      ) : (
                        'BRICO'
                      )}
                    </span>
                    <div>
                      <strong>{item.title}</strong>
                      <small>
                        {labels.quantity}: {item.quantity}
                      </small>
                    </div>
                    <b>{formatProductPrice(String(item.unitPrice * item.quantity), locale)}</b>
                  </li>
                ))}
              </ul>
              <dl>
                <div>
                  <dt>{labels.subtotal}</dt>
                  <dd>{formatProductPrice(String(subtotal), locale)}</dd>
                </div>
                <div>
                  <dt>{labels.delivery}</dt>
                  <dd>{formatProductPrice(String(deliveryFee), locale)}</dd>
                </div>
                <div>
                  <dt>{labels.total}</dt>
                  <dd>{formatProductPrice(String(total), locale)}</dd>
                </div>
              </dl>
            </>
          )}
          {requestError && !pending ? (
            <p className="checkout-submit-error" role="alert">
              {requestError}
            </p>
          ) : null}
          {itemCount > 50 && !pending ? (
            <p role="alert">
              {labels.quantityLimit}{' '}
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event('bric:cart-open'))}
              >
                {labels.editCart}
              </button>
            </p>
          ) : null}
          <button
            className="checkout-submit"
            type="submit"
            disabled={
              !hydrated ||
              busy ||
              retryBlocked ||
              (!pending && (items.length === 0 || itemCount > 50))
            }
            onPointerDown={prepareHaptics}
            onMouseEnter={startSubmitIconAnimation}
            onMouseLeave={() => submitIconRef.current?.stopAnimation()}
            onFocus={startSubmitIconAnimation}
            onBlur={() => submitIconRef.current?.stopAnimation()}
          >
            {busy ? (
              <LoaderCircle className="checkout-spinner" aria-hidden="true" />
            ) : (
              <ShieldCheckIcon
                ref={submitIconRef}
                className="checkout-submit-icon"
                size={18}
                aria-hidden="true"
              />
            )}
            {busy ? labels.submitting : labels.submit}
            {!busy ? <ArrowRight aria-hidden="true" /> : null}
          </button>
          <div className="checkout-trust">
            <span>
              <PhoneCall aria-hidden="true" />
              {labels.trustPhone}
            </span>
            <span>
              <PackageCheck aria-hidden="true" />
              {labels.trustPayment}
            </span>
            <span>
              <Truck aria-hidden="true" />
              {labels.trustDelivery}
            </span>
          </div>
          {support ? (
            <SupportContactActions
              locale={locale}
              contact={support.contact}
              labels={support.labels}
              surface="checkout"
            />
          ) : null}
        </aside>
      </form>
    </Root>
  );
}
