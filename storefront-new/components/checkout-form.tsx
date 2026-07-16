'use client';

import NumberFlow from '@number-flow/react';
import type { StorefrontEcotrackCatalogResponse } from '@bric/storefront-core/contracts';
import { ArrowRight, Check, LoaderCircle, MapPin, PackageCheck, PhoneCall, RotateCcw, Truck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { StorefrontImage } from '@/components/storefront-image';
import { SupportContactActions, type SupportContactLabels } from '@/components/support-contact-actions';
import { ShieldCheckIcon, type ShieldCheckIconHandle } from '@/components/ui/shield-check';
import type { Locale } from '@/i18n/config';
import { getAnalyticsIdentity, trackCheckoutEvent } from '@/lib/analytics';
import { readCart, STOREFRONT_CART_KEY, type CartItem } from '@/lib/cart';
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
import type { StorefrontSettingsResponse } from '@bric/storefront-core/contracts';

type CheckoutLabels = {
  title: string;
  description: string;
  phone: string;
  phonePlaceholder: string;
  phoneError: string;
  lastName: string;
  firstName: string;
  wilaya: string;
  commune: string;
  address: string;
  email: string;
  optional: string;
  deliveryMode: string;
  homeDelivery: string;
  officeDelivery: string;
  officeUnavailable: string;
  orderSummary: string;
  subtotal: string;
  delivery: string;
  total: string;
  quantity: string;
  submit: string;
  submitting: string;
  emptyTitle: string;
  emptyBody: string;
  browseProducts: string;
  requiredError: string;
  emailError: string;
  submitError: string;
  retry: string;
  savedAttempt: string;
  trustPhone: string;
  trustPayment: string;
  trustDelivery: string;
};

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CheckoutForm({
  locale,
  catalog,
  directItem,
  labels,
  support,
}: {
  locale: Locale;
  catalog: StorefrontEcotrackCatalogResponse;
  directItem: CartItem | null;
  labels: CheckoutLabels;
  support?: { contact: StorefrontSettingsResponse; labels: SupportContactLabels };
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
  const submissionLock = useRef(false);
  const submitIconRef = useRef<ShieldCheckIconHandle>(null);
  const viewed = useRef(false);

  useEffect(() => {
    if (!directItem) setItems(readCart(window.localStorage));
    const savedAttempt = readPendingCheckout(window.localStorage);
    const savedDraft = readCheckoutDraft(window.localStorage);
    const restored = savedDraft ?? (savedAttempt ? {
      phoneNumber1: savedAttempt.payload.phoneNumber1,
      lastName: savedAttempt.payload.lastName ?? '',
      firstName: savedAttempt.payload.firstName ?? '',
      state: savedAttempt.payload.state,
      city: savedAttempt.payload.city ?? '',
      homeAddress: savedAttempt.payload.homeAddress ?? '',
      email: savedAttempt.payload.email ?? '',
      delivery: savedAttempt.payload.delivery === 1 ? 'office' as const : 'home' as const,
    } : null);
    if (restored) {
      const validCity = restored.state != null
        && catalog.communes.some((commune) => commune.wilayaId === restored.state && commune.name === restored.city);
      const officeAvailableForDraft = restored.state != null
        && catalog.communes.some((commune) => commune.wilayaId === restored.state && commune.hasStopDesk);
      setPhoneNumber1(restored.phoneNumber1);
      setLastName(restored.lastName);
      setFirstName(restored.firstName);
      setState(restored.state);
      setCity(validCity ? restored.city : '');
      setHomeAddress(restored.homeAddress);
      setEmail(restored.email);
      setDelivery(restored.delivery === 'office' && officeAvailableForDraft ? 'office' : 'home');
    }
    setPending(savedAttempt);
    if (savedAttempt) setRequestError(labels.submitError);
    setHydrated(true);
    void prepareHaptics();
  }, [catalog.communes, directItem, labels.submitError]);

  useEffect(() => {
    if (!hydrated) return;
    writeCheckoutDraft(window.localStorage, {
      phoneNumber1, lastName, firstName, state, city, homeAddress, email, delivery,
    });
  }, [city, delivery, email, firstName, homeAddress, hydrated, lastName, phoneNumber1, state]);

  const communes = useMemo(() => getCheckoutCommunes(catalog, state), [catalog, state]);
  const officeAvailable = hasCheckoutStopDesk(catalog, state);
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const deliveryFee = getCheckoutDeliveryFee(catalog, state, delivery);
  const total = subtotal + deliveryFee;
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const cartMode = directItem ? 'direct' as const : 'cart' as const;

  useEffect(() => {
    if (viewed.current || !hydrated || itemCount === 0) return;
    viewed.current = true;
    void trackCheckoutEvent({
      eventName: 'begin_checkout', locale, quantity: itemCount, value: total,
      metadata: { cartMode, itemCount },
    });
  }, [cartMode, hydrated, itemCount, locale, total]);

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
      const stateName = catalog.wilayas.find((wilaya) => wilaya.wilayaId === order.state)?.name ?? null;
      writeCheckoutConfirmation(window.localStorage, {
        order,
        cartMode,
        stateName,
        createdAt: new Date().toISOString(),
        purchaseEventId: attempt.payload.marketing?.eventId ?? null,
      });
      clearPendingCheckout(window.localStorage);
      window.localStorage.removeItem(STOREFRONT_CART_KEY);
      window.dispatchEvent(new CustomEvent('bric:cart-updated'));
      setPending(null);
      void triggerHaptic('success');
      void trackCheckoutEvent({
        eventName: 'order_create_success', locale, orderId: order.id,
        quantity: itemCount, value: order.totalAmount,
        metadata: { cartMode, itemCount, delivery },
      });
      router.push(`/${locale}/thank-you?orderId=${order.id}&token=${encodeURIComponent(order.publicToken!)}`);
    } catch (error) {
      const code = error instanceof CheckoutOrderError ? error.code : 'request_failed';
      setPending(readPendingCheckout(window.localStorage));
      setRequestError(labels.submitError);
      void triggerHaptic('error');
      void trackCheckoutEvent({
        eventName: 'order_create_failed', locale, quantity: itemCount, value: total,
        metadata: { cartMode, itemCount, delivery, failureCode: code },
      });
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (items.length === 0) return;
    const parsed = checkoutFormSchema.safeParse({
      phoneNumber1, lastName, firstName, state, city, homeAddress, email, delivery,
    });
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? 'form');
        nextErrors[field] = issue.message === 'invalid_email'
          ? labels.emailError
          : issue.message === 'phone_invalid'
            ? labels.phoneError
            : labels.requiredError;
      }
      setErrors(nextErrors);
      setRequestError('');
      window.setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setErrors({});
    const identity = getAnalyticsIdentity();
    const purchaseEventId = createId();
    const payload = buildCheckoutOrderPayload({
      form: parsed.data,
      cartProducts: expandCheckoutCart(items),
      journeyId: identity.journeyId,
      sessionId: identity.sessionId,
      marketing: getMarketingOrderContext(purchaseEventId),
    });
    const attempt = { idempotencyKey: createId(), payload, createdAt: new Date().toISOString() };
    writePendingCheckout(window.localStorage, attempt);
    setPending(attempt);
    void triggerHaptic('primary');
    void trackCheckoutEvent({
      eventName: 'checkout_submit_attempt', locale, quantity: itemCount, value: total,
      metadata: { cartMode, itemCount, delivery },
    });
    await completeSubmission(attempt);
  }

  if (!hydrated && !directItem) return <CheckoutContentSkeleton />;

  if (hydrated && items.length === 0) {
    return (
      <main className="checkout-page checkout-empty">
        <PackageCheck aria-hidden="true" />
        <h1>{labels.emptyTitle}</h1>
        <p>{labels.emptyBody}</p>
        <a className="button button-primary" href={`/${locale}/products`}>{labels.browseProducts}</a>
      </main>
    );
  }

  return (
    <main className="checkout-page">
      <header className="checkout-heading">
        <h1>{labels.title}</h1>
        <span>{labels.description}</span>
      </header>

      {pending && requestError ? (
        <section className="checkout-recovery" role="alert">
          <RotateCcw aria-hidden="true" />
          <div><strong>{labels.savedAttempt}</strong><p>{requestError}</p></div>
          <button type="button" onClick={() => void completeSubmission(pending)} disabled={submitting}>{labels.retry}</button>
          {support ? <SupportContactActions locale={locale} contact={support.contact} labels={support.labels} surface="checkout" variant="recovery" /> : null}
        </section>
      ) : null}

      <form className="checkout-layout" onSubmit={submit} noValidate>
        <section className="checkout-form-panel" aria-label={labels.title}>
          <div className="checkout-fields">
            <label className="checkout-field checkout-field-phone">
              <span>{labels.phone} <b>*</b></span>
              <input name="phoneNumber1" type="tel" inputMode="tel" autoComplete="tel" value={phoneNumber1} placeholder={labels.phonePlaceholder} aria-invalid={Boolean(errors.phoneNumber1)} aria-describedby={errors.phoneNumber1 ? 'phone-error' : undefined} onChange={(event) => setPhoneNumber1(event.target.value)} />
              {errors.phoneNumber1 ? <small id="phone-error">{errors.phoneNumber1}</small> : null}
            </label>
            <label className="checkout-field">
              <span>{labels.lastName} <em>{labels.optional}</em></span>
              <input name="lastName" autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} />
            </label>
            <label className="checkout-field">
              <span>{labels.firstName} <em>{labels.optional}</em></span>
              <input name="firstName" autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
            </label>
            <label className="checkout-field">
              <span>{labels.wilaya} <b>*</b></span>
              <select name="state" value={state ?? ''} aria-invalid={Boolean(errors.state)} onChange={(event) => { setState(event.target.value ? Number(event.target.value) : null); setCity(''); if (delivery === 'office') setDelivery('home'); }}>
                <option value="">{labels.wilaya}</option>
                {catalog.wilayas.map((wilaya) => <option key={wilaya.wilayaId} value={wilaya.wilayaId}>{wilaya.wilayaId}. {wilaya.name}</option>)}
              </select>
              {errors.state ? <small>{errors.state}</small> : null}
            </label>
            <label className="checkout-field">
              <span>{labels.commune} <b>*</b></span>
              <select name="city" value={city} aria-disabled={state == null} aria-invalid={Boolean(errors.city)} onChange={(event) => setCity(event.target.value)}>
                <option value="">{labels.commune}</option>
                {communes.map((commune) => <option key={commune.communeId} value={commune.name}>{commune.name}{commune.hasStopDesk ? ' •' : ''}</option>)}
              </select>
              {errors.city ? <small>{errors.city}</small> : null}
            </label>
            <label className="checkout-field checkout-field-wide">
              <span>{labels.address} {delivery === 'office' ? <em>{labels.optional}</em> : <b>*</b>}</span>
              <input name="homeAddress" autoComplete="street-address" required={delivery === 'home'} value={homeAddress} aria-invalid={Boolean(errors.homeAddress)} aria-describedby={errors.homeAddress ? 'address-error' : undefined} onChange={(event) => setHomeAddress(event.target.value)} />
              {errors.homeAddress ? <small id="address-error">{errors.homeAddress}</small> : null}
            </label>
            <label className="checkout-field checkout-field-wide">
              <span>{labels.email} <em>{labels.optional}</em></span>
              <input name="email" type="email" inputMode="email" autoComplete="email" value={email} aria-invalid={Boolean(errors.email)} onChange={(event) => setEmail(event.target.value)} />
              {errors.email ? <small>{errors.email}</small> : null}
            </label>
          </div>

          <fieldset className="checkout-delivery">
            <legend>{labels.deliveryMode}</legend>
            <button type="button" aria-pressed={delivery === 'home'} onClick={() => chooseDelivery('home')}><Truck aria-hidden="true" /><span><strong>{labels.homeDelivery}</strong></span><Check aria-hidden="true" /></button>
            <button type="button" aria-pressed={delivery === 'office'} aria-disabled={!officeAvailable} onClick={() => chooseDelivery('office')}><MapPin aria-hidden="true" /><span><strong>{labels.officeDelivery}</strong>{!officeAvailable && state ? <small>{labels.officeUnavailable}</small> : null}</span><Check aria-hidden="true" /></button>
          </fieldset>
        </section>

        <aside className="checkout-summary">
          <h2>{labels.orderSummary}</h2>
          <ul>
            {items.map((item) => (
              <li key={item.productId}>
                <span className="checkout-summary-image">{item.imageUrl ? <StorefrontImage src={item.imageUrl} alt="" width={72} height={72} sizes="64px" quality={60} /> : 'BRICO'}</span>
                <div><strong>{item.title}</strong><small>{labels.quantity}: {item.quantity}</small></div>
                <b>{formatProductPrice(String(item.unitPrice * item.quantity), locale)}</b>
              </li>
            ))}
          </ul>
          <dl>
            <div><dt>{labels.subtotal}</dt><dd><NumberFlow value={subtotal} locales={locale} format={{ style: 'currency', currency: 'DZD', maximumFractionDigits: 0 }} /></dd></div>
            <div><dt>{labels.delivery}</dt><dd><NumberFlow value={deliveryFee} locales={locale} format={{ style: 'currency', currency: 'DZD', maximumFractionDigits: 0 }} /></dd></div>
            <div><dt>{labels.total}</dt><dd><NumberFlow value={total} locales={locale} format={{ style: 'currency', currency: 'DZD', maximumFractionDigits: 0 }} /></dd></div>
          </dl>
          {requestError && !pending ? <p className="checkout-submit-error" role="alert">{requestError}</p> : null}
          <button className="checkout-submit" type="submit" disabled={submitting || !hydrated || items.length === 0} onPointerDown={prepareHaptics} onMouseEnter={startSubmitIconAnimation} onMouseLeave={() => submitIconRef.current?.stopAnimation()} onFocus={startSubmitIconAnimation} onBlur={() => submitIconRef.current?.stopAnimation()}>
            {submitting ? <LoaderCircle className="checkout-spinner" aria-hidden="true" /> : <ShieldCheckIcon ref={submitIconRef} className="checkout-submit-icon" size={18} aria-hidden="true" />}
            {submitting ? labels.submitting : labels.submit}
            {!submitting ? <ArrowRight aria-hidden="true" /> : null}
          </button>
          <div className="checkout-trust"><span><PhoneCall aria-hidden="true" />{labels.trustPhone}</span><span><PackageCheck aria-hidden="true" />{labels.trustPayment}</span><span><Truck aria-hidden="true" />{labels.trustDelivery}</span></div>
          {support ? <SupportContactActions locale={locale} contact={support.contact} labels={support.labels} surface="checkout" /> : null}
        </aside>
      </form>
    </main>
  );
}
