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
import {
  SupportContactActions,
  type SupportContactLabels,
  type StorefrontSupportContact,
} from '@/components/support-contact-actions';
import { ShieldCheckIcon, type ShieldCheckIconHandle } from '@/components/ui/shield-check';
import type { Locale } from '@/i18n/config';
import { getAnalyticsIdentity, trackCheckoutEvent } from '@/lib/analytics';
import {
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
  writeCheckoutDraft,
  writeCheckoutConfirmation,
  writePendingCheckout,
  type PendingCheckout,
} from '@/lib/checkout';
import { prepareHaptics, triggerHaptic } from '@/lib/haptics';
import { CheckoutContentSkeleton } from '@/components/storefront-skeletons';
import { CheckoutOrderError, createCheckoutOrder } from '@/lib/orders';
import { formatProductPrice } from '@/lib/product-presentation';
import { getMarketingOrderContext } from '@/lib/marketing-attribution';
import type { CheckoutLabels } from '@/lib/checkout-labels';
import {
  LANDING_ORDER_QUANTITY_EVENT,
  LANDING_ORDER_SECTION_ID,
  type LandingOrderQuantityDetail,
} from '@/lib/landing-order';

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
  labels,
  support,
}: {
  locale: Locale;
  catalog: StorefrontEcotrackCatalogResponse;
  directItem: CartItem | null;
  landingAttribution?: { landingPageId: number; landingRevision: number };
  embedded?: boolean;
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
  const [requestError, setRequestError] = useState('');
  const [pending, setPending] = useState<PendingCheckout | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [validating, setValidating] = useState(false);
  const busy = validating || submitting;
  const submissionLock = useRef(false);
  const submitIconRef = useRef<ShieldCheckIconHandle>(null);
  const viewed = useRef(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- Checkout persistence must hydrate before the customer can submit the form. */
    if (!directItem) {
      const storedItems = readCart(window.localStorage);
      setItems(storedItems);
      void reconcileCartWithCatalog(storedItems)
        .then((reconciled) => {
          if (!reconciled.changed) return;
          setItems(reconciled.items);
          writeCart(window.localStorage, reconciled.items);
          window.dispatchEvent(new CustomEvent('bric:cart-updated'));
          setRequestError(labels.cartUpdated);
        })
        .catch(() => undefined);
    }
    const savedAttempt = readPendingCheckout(window.localStorage);
    const savedDraft = readCheckoutDraft(window.localStorage);
    const restored =
      savedDraft ??
      (savedAttempt
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
        : null);
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
      setCity(validCity ? restored.city : '');
      setHomeAddress(restored.homeAddress);
      setEmail(restored.email);
      setDelivery(restored.delivery === 'office' && officeAvailableForDraft ? 'office' : 'home');
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
    if (savedAttempt) setRequestError(labels.submitError);
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    void prepareHaptics();
  }, [catalog, directItem, labels.cartUpdated, labels.submitError]);

  useEffect(() => {
    if (!embedded || !directItem) return;
    const updateQuantity = (event: Event) => {
      const detail = (event as CustomEvent<LandingOrderQuantityDetail>).detail;
      if (!detail || detail.productId !== directItem.productId) return;
      const quantity = Math.max(1, Math.min(20, detail.quantity));
      setItems((current) =>
        current.map((item) => (item.productId === detail.productId ? { ...item, quantity } : item)),
      );
    };
    window.addEventListener(LANDING_ORDER_QUANTITY_EVENT, updateQuantity);
    return () => window.removeEventListener(LANDING_ORDER_QUANTITY_EVENT, updateQuantity);
  }, [directItem, embedded]);

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
  const deliveryFee = getCheckoutDeliveryFee(catalog, state, delivery);
  const total = subtotal + deliveryFee;
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const cartMode = directItem ? ('direct' as const) : ('cart' as const);

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
    if (submissionLock.current) return;
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
        window.localStorage.removeItem(STOREFRONT_CART_KEY);
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
      if (code === 'cart_changed') {
        clearPendingCheckout(window.localStorage);
        setPending(null);
        try {
          const reconciled = await reconcileCartWithCatalog(items);
          setItems(reconciled.items);
          if (!directItem) writeCart(window.localStorage, reconciled.items);
          window.dispatchEvent(new CustomEvent('bric:cart-updated'));
        } catch {
          // A fresh submit will validate again before creating another attempt.
        }
        setRequestError(labels.cartUpdated);
      } else {
        setPending(readPendingCheckout(window.localStorage) ?? attempt);
        setRequestError(labels.submitError);
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
    if (!hydrated || items.length === 0) return;
    setValidating(true);
    setRequestError('');
    try {
      const reconciled = await reconcileCartWithCatalog(items);
      const validatedItems = reconciled.items;
      if (reconciled.changed) {
        setItems(reconciled.items);
        if (!directItem) writeCart(window.localStorage, reconciled.items);
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
        setErrors(nextErrors);
        setRequestError('');
        window.setTimeout(
          () => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
          0,
        );
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
        ...attribution,
      });
      const attempt = { idempotencyKey: createId(), payload, createdAt: new Date().toISOString() };
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
      setValidating(false);
    }
  }

  if (!hydrated && !directItem) return <CheckoutContentSkeleton />;

  if (hydrated && items.length === 0) {
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
          <button type="button" onClick={() => void completeSubmission(pending)} disabled={busy}>
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

      <form className="checkout-layout" onSubmit={submit} aria-busy={busy} noValidate>
        <section className="checkout-form-panel" aria-label={labels.title}>
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
        </section>

        <aside className="checkout-summary">
          <h2>{labels.orderSummary}</h2>
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
          {requestError && !pending ? (
            <p className="checkout-submit-error" role="alert">
              {requestError}
            </p>
          ) : null}
          <button
            className="checkout-submit"
            type="submit"
            disabled={!hydrated || busy || items.length === 0}
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
