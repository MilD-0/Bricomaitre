'use client';
import { useLandingOrder } from '@/components/landing-order-context';
import {
  type StorefrontSupportContact,
  type SupportContactLabels,
} from '@/components/support-contact-actions';
import { type ShieldCheckIconHandle } from '@/components/ui/shield-check';
import type { Locale } from '@/i18n/config';
import {
  mergeCartValidation,
  readCart,
  reconcileCartWithCatalog,
  writeCart,
  type CartItem,
} from '@/lib/cart';
import {
  hasCheckoutStopDesk,
  readCheckoutDraft,
  readPendingCheckout,
  type PendingCheckout,
} from '@/lib/checkout';
import type { CheckoutLabels } from '@/lib/checkout-labels';
import { prepareHaptics } from '@/lib/haptics';
import type { StorefrontEcotrackCatalogResponse } from '@bric/storefront-core/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
export function useCheckoutState({
  locale,
  catalog,
  directItem,
  embedded = false,
  initialNotice,
  labels,
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
  const [storedItems, setItems] = useState<CartItem[]>(directItem ? [directItem] : []);
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
  const landing = useLandingOrder();
  const landingQuantity =
    embedded && landing && landing.productId === directItem?.productId ? landing.quantity : null;
  const items = useMemo(
    () =>
      pending?.items ??
      (landingQuantity !== null
        ? storedItems.map((item) =>
            item.productId === directItem?.productId
              ? { ...item, quantity: landingQuantity }
              : item,
          )
        : storedItems),
    [storedItems, landingQuantity, directItem?.productId, pending],
  );
  const setLandingLocked = landing?.setLocked;
  const setLandingQuantity = landing?.setQuantity;
  const pendingLandingQuantity = pending?.items?.find(
    (item) => item.productId === landing?.productId,
  )?.quantity;
  useEffect(() => {
    if (pendingLandingQuantity !== undefined) setLandingQuantity?.(pendingLandingQuantity);
  }, [pendingLandingQuantity, setLandingQuantity]);
  useEffect(() => {
    setLandingLocked?.(busy || Boolean(pending));
    return () => setLandingLocked?.(false);
  }, [busy, pending, setLandingLocked]);
  const retryBlocked = retryAt > 0;
  const submissionLockRef = useRef(false);
  const validationLockRef = useRef(false);
  const submitIconRef = useRef<ShieldCheckIconHandle>(null);
  const viewedRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const focusInvalidRef = useRef(false);
  useEffect(() => {
    if (!focusInvalidRef.current || busy) return;
    const field = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (field) {
      focusInvalidRef.current = false;
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
  return {
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
  } as const;
}
