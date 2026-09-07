'use client';
import { StorefrontImage } from '@/components/storefront-image';
import { SupportContactActions } from '@/components/support-contact-actions';
import { ShieldCheckIcon } from '@/components/ui/shield-check';
import { prepareHaptics } from '@/lib/haptics';
import { LANDING_ORDER_SECTION_ID } from '@/lib/landing-order';
import { formatProductPrice } from '@/lib/product-presentation';
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
import { type useCheckoutForm } from './use-checkout';

export function CheckoutFormView({
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
}: NonNullable<ReturnType<typeof useCheckoutForm>['view']>) {
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
