"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useContext, useEffectEvent, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { getCookie } from "cookies-next";

import { CartContext } from "./cartContext";
import PhoneBadge from "./PhoneBadge";
import {
  enrichPastEvents,
  getOrCreateExternalId,
  handlePurchase,
} from "./Init";
import {
  buildItemArray,
  getAnalyticsContextMetadata,
  getVisitIdFromCookie,
  getOrCreateJourneyId,
  getOrCreateSessionId,
  trackAnalyticsEvent,
} from "@/lib/analytics";
import {
  getAddressHelperKey,
  getCheckoutCartMode,
  getCheckoutItemCount,
  getDefaultOptionalDetailsExpanded,
  isCheckoutCoreComplete,
} from "@/lib/checkout-fast-path";
import { isPaidTrafficSession } from "@/lib/paid-session";
import {
  findDeliveryFee,
  findWilayaByName,
  getCommunesForWilaya,
  hasStopDeskForWilaya,
} from "@/lib/storefront-api";
import { formatCommuneOptionLabel } from "@/lib/commune-label";
import {
  clearPendingOrderSubmission,
  readPendingOrderSubmission,
  writePendingOrderSubmission,
} from "@/lib/pending-order-submission";
import {
  clearPendingOrderVerification,
  readPendingOrderVerification,
  writePendingOrderVerification,
} from "@/lib/pending-order-verification";
import {
  clearRecentOrderSignature,
  hasRecentOrderSignature,
  hasTrackedPurchase,
  markPurchaseTracked,
  writeRecentOrderSignature,
  writeCompletedOrderSnapshot,
} from "@/lib/completed-order-state";
import {
  StorefrontOrderClientError,
  createStorefrontOrder,
  patchStorefrontOrder,
  readVerifiedStorefrontOrder,
} from "@/lib/storefront-order-client";
import { usePathname, useRouter } from "@/i18n/navigation";

const FREE_SHIPPING_PRODUCT_ID = "f00000000000000000000005";

function normalizeText(value) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildFullName(firstName, lastName, phoneNumber) {
  const parts = [firstName, lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : phoneNumber;
}

function buildDuplicateSignatureValue({
  phoneNumber1,
  city,
  delivery,
  total,
  cartProducts,
}) {
  return JSON.stringify({
    phoneNumber1,
    city,
    delivery,
    total: Number(total.toFixed(2)),
    cartProducts: [...cartProducts].sort(),
  });
}

function toSnapshotItems({ cart, cartSummary, singleProduct, quantity }) {
  if (!cart) {
    if (!singleProduct) {
      return [];
    }

    return [
      {
        rawValue: String(singleProduct._id),
        productId: typeof singleProduct.id === "number" ? singleProduct.id : null,
        title: typeof singleProduct.title === "string" ? singleProduct.title : "",
        unitPrice: typeof singleProduct.price === "number" ? singleProduct.price : Number(singleProduct.price ?? 0),
        quantity,
        lineTotal: (typeof singleProduct.price === "number" ? singleProduct.price : Number(singleProduct.price ?? 0)) * quantity,
        thumbnailUrl: Array.isArray(singleProduct.images) ? singleProduct.images[0] ?? null : null,
        missing: false,
      },
    ];
  }

  return cartSummary.items
    .filter((item) => item.product)
    .map((item) => ({
      rawValue: String(item.product._id),
      productId: typeof item.product.id === "number" ? item.product.id : null,
      title: typeof item.product.title === "string" ? item.product.title : "",
      unitPrice: typeof item.product.price === "number" ? item.product.price : Number(item.product.price ?? 0),
      quantity: item.quantity,
      lineTotal: item.lineTotal,
      thumbnailUrl: Array.isArray(item.product.images) ? item.product.images[0] ?? null : null,
      missing: false,
    }));
}

export default function OrderForm({ prod, cart, order, showMobileStickySubmit = true }) {
  const t = useTranslations("checkout");
  const router = useRouter();
  const pathname = usePathname() || "none";
  const storage = typeof window !== "undefined" ? window.localStorage : null;
  const modify = Boolean(order);
  const submissionLockRef = useRef(false);
  const lastLoadedCartKeyRef = useRef("");
  const phoneInputRef = useRef(null);
  const wilayaSelectRef = useRef(null);
  const communeSelectRef = useRef(null);

  const { clearCart, cartProducts, cartSummary, rememberProducts, setCart } = useContext(CartContext);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [singleProduct, setSingleProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [deliveryCatalog, setDeliveryCatalog] = useState(null);
  const [pendingVerification, setPendingVerification] = useState(null);
  const [pendingSubmission, setPendingSubmission] = useState(null);
  const [verificationError, setVerificationError] = useState("");
  const [checkoutAttempted, setCheckoutAttempted] = useState(false);
  const [isRetryingVerification, setIsRetryingVerification] = useState(false);

  const [firstName, setFirstName] = useState(storage?.getItem("firstName") || "");
  const [lastName, setLastName] = useState(storage?.getItem("lastName") || "");
  const [homeAddress, setHomeAddress] = useState(
    storage?.getItem("homeAddress") || "",
  );
  const [phoneNumber1, setPhoneNumber1] = useState(
    storage?.getItem("phoneNumber1") || "",
  );
  const [phoneNumber2] = useState(
    storage?.getItem("phoneNumber2") || "",
  );
  const [email, setEmail] = useState(storage?.getItem("email") || "");
  const [delivery, setDelivery] = useState(storage?.getItem("delivery") || "home");
  const [selectedWilayaId, setSelectedWilayaId] = useState(null);
  const [selectedWilayaName, setSelectedWilayaName] = useState(
    storage?.getItem("state") || "",
  );
  const [city, setCity] = useState(storage?.getItem("city") || "");
  const [showOfficeFallbackNotice, setShowOfficeFallbackNotice] = useState(false);
  const [optionalDetailsExpanded, setOptionalDetailsExpanded] = useState(
    getDefaultOptionalDetailsExpanded(),
  );
  const optionalExpandTrackedRef = useRef(false);
  const checkoutViewTrackedRef = useRef(false);

  useEffect(() => {
    if (modify) {
      setCart();
    }
  }, [modify, setCart]);

  useEffect(() => {
    setPendingSubmission(readPendingOrderSubmission());
    setPendingVerification(readPendingOrderVerification());
  }, []);

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const response = await fetch("/api/ecotrack/catalog");
        if (!response.ok) {
          throw new Error("Failed to load Ecotrack catalog");
        }

        const data = await response.json();
        setDeliveryCatalog(data);
      } catch (error) {
        console.error(error);
      }
    };

    loadCatalog();
  }, []);

  useEffect(() => {
    if (!deliveryCatalog || selectedWilayaId != null) {
      return;
    }

    const savedCode = storage?.getItem("stateCode");
    const fromCode = savedCode
      ? deliveryCatalog.wilayas.find(
          (wilaya) => wilaya.wilayaId === Number(savedCode),
        ) ?? null
      : null;
    const fromName = findWilayaByName(
      deliveryCatalog.wilayas,
      storage?.getItem("state"),
    );
    const initialWilaya = fromCode ?? fromName ?? null;

    if (initialWilaya) {
      setSelectedWilayaId(initialWilaya.wilayaId);
      setSelectedWilayaName(initialWilaya.name);
    }
  }, [deliveryCatalog, selectedWilayaId, storage]);

  const loadCartProducts = useEffectEvent(async () => {
    try {
      const response = await fetch("/api/cart", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: cartProducts }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch cart products");
      }

      const data = await response.json();
      rememberProducts(data);
    } catch (error) {
      console.error(error);
    }
  });

  useEffect(() => {
    if (!cart || cartProducts.length === 0) {
      lastLoadedCartKeyRef.current = "";
      return;
    }

    const cartKey = cartProducts.join(",");
    if (lastLoadedCartKeyRef.current === cartKey) {
      return;
    }

    lastLoadedCartKeyRef.current = cartKey;
    void loadCartProducts();
  }, [cart, cartProducts]);

  useEffect(() => {
    if (!prod) {
      setSingleProduct(null);
      return;
    }

    const loadSingleProduct = async () => {
      try {
        const response = await fetch(`/api/products?id=${prod}`);
        if (!response.ok) {
          throw new Error("Failed to fetch product");
        }

        setSingleProduct(await response.json());
      } catch (error) {
        console.error(error);
      }
    };

    loadSingleProduct();
  }, [prod]);

  const availableCommunes = getCommunesForWilaya(deliveryCatalog, selectedWilayaId);
  const selectedCommune =
    availableCommunes.find((commune) => commune.name === city) ?? null;
  const hasSelectedCommune = selectedCommune != null;
  const officeAvailable = selectedWilayaId == null
    ? true
    : hasStopDeskForWilaya(deliveryCatalog, selectedWilayaId);
  const stopDeskSuffix = t("stopDeskOptionSuffix");

  useEffect(() => {
    if (city && !availableCommunes.some((commune) => commune.name === city)) {
      setCity("");
    }
  }, [availableCommunes, city]);

  useEffect(() => {
    if (delivery === "office" && selectedWilayaId != null && !officeAvailable) {
      setDelivery("home");
      setShowOfficeFallbackNotice(true);
      return;
    }

    if (selectedWilayaId == null || officeAvailable) {
      setShowOfficeFallbackNotice(false);
    }
  }, [delivery, officeAvailable, selectedWilayaId]);

  const hasFreeShippingProduct = cart
    ? cartProducts.length > 0 &&
      cartProducts.every((productId) => productId === FREE_SHIPPING_PRODUCT_ID)
    : singleProduct?._id === FREE_SHIPPING_PRODUCT_ID;

  const deliveryFee = hasFreeShippingProduct
    ? 0
    : findDeliveryFee(deliveryCatalog, selectedWilayaId, delivery);
  const singleProductPrice = singleProduct?.price ?? 0;
  const subtotal = cart ? cartSummary.subtotal : singleProductPrice * quantity;
  const totalAmount = subtotal + deliveryFee;
  const paidSession = isPaidTrafficSession();
  const cartMode = getCheckoutCartMode(cart);
  const itemCount = getCheckoutItemCount({
    cart,
    cartProducts,
    quantity,
  });
  const coreFieldsComplete = isCheckoutCoreComplete({
    phoneNumber1,
    selectedWilayaId,
    city: hasSelectedCommune ? city : "",
  });
  const submitDisabled = isSubmitting || pendingVerification != null;
  const addressHelperKey = getAddressHelperKey(delivery);
  const showLocationRequiredHint =
    checkoutAttempted && (selectedWilayaId == null || !hasSelectedCommune);

  useEffect(() => {
    if (coreFieldsComplete) {
      setCheckoutAttempted(false);
    }
  }, [coreFieldsComplete]);

  useEffect(() => {
    if (checkoutViewTrackedRef.current) {
      return;
    }

    if (itemCount === 0 || subtotal <= 0) {
      return;
    }

    checkoutViewTrackedRef.current = true;
    void trackAnalyticsEvent({
      eventName: "checkout_view",
      gaEventName: "checkout_view",
      quantity: itemCount,
      value: totalAmount,
      metadata: {
        ...getAnalyticsContextMetadata({
          paidSession,
          sourceSurface: "checkout",
        }),
        cartMode,
        itemCount,
      },
    }).catch((error) => console.error(error));
  }, [cartMode, itemCount, paidSession, subtotal, totalAmount]);

  function expandOptionalDetails() {
    setOptionalDetailsExpanded(true);

    if (optionalExpandTrackedRef.current) {
      return;
    }

    optionalExpandTrackedRef.current = true;
    void trackAnalyticsEvent({
      eventName: "checkout_optional_details_expand",
      gaEventName: "checkout_optional_details_expand",
      metadata: {
        ...getAnalyticsContextMetadata({
          paidSession,
          sourceSurface: "checkout",
        }),
        cartMode,
      },
    }).catch((error) => console.error(error));
  }

  function isDuplicateOrder(currentOrder) {
    const lastOrder = storage?.getItem("lastOrder");
    if (!lastOrder) {
      return false;
    }

    try {
      const parsedLastOrder = JSON.parse(lastOrder);
      if (Date.now() - parsedLastOrder.timestamp > 300000) {
        return false;
      }

      return (
        parsedLastOrder.phoneNumber1 === currentOrder.phoneNumber1 &&
        parsedLastOrder.city === currentOrder.city &&
        parsedLastOrder.delivery === currentOrder.delivery &&
        parsedLastOrder.total === currentOrder.total &&
        parsedLastOrder.signature === currentOrder.signature
      );
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  function handleDeliveryChange(nextDelivery) {
    setDelivery(nextDelivery);
    setShowOfficeFallbackNotice(false);
  }

  function persistSuccessfulOrder({ orderId, token, mode, duplicateSignature, snapshot }) {
    writePendingOrderVerification({
      orderId,
      token,
      mode,
      createdAt: new Date().toISOString(),
    });
    setPendingVerification(readPendingOrderVerification());

    clearPendingOrderSubmission();
    setPendingSubmission(null);
    setVerificationError("");

    storage?.setItem("orderId", String(orderId));
    storage?.setItem("orderToken", token);
    writeCompletedOrderSnapshot(snapshot);
    if (duplicateSignature) {
      clearRecentOrderSignature();
      storage?.setItem(
        "lastOrder",
        JSON.stringify({
          ...duplicateSignature,
          timestamp: Date.now(),
        }),
      );
    }

    clearCart();
  }

  function pushThankYou({ orderId, token, mode }) {
    const search = new URLSearchParams({
      orderId: String(orderId),
      token,
      ...(mode === "patch" ? { modified: "true" } : {}),
    });
    router.push(`/thank-you?${search.toString()}`);
  }

  async function verifyPendingOrder({ orderId, token }) {
    const verifiedOrder = await readVerifiedStorefrontOrder({ orderId, token });
    clearPendingOrderVerification();
    setPendingVerification(null);
    setVerificationError("");

    return verifiedOrder;
  }

  async function retryPendingVerification() {
    const currentPendingVerification = readPendingOrderVerification();
    if (!currentPendingVerification) {
      setPendingVerification(null);
      return;
    }

    setIsRetryingVerification(true);
    setVerificationError("");

    try {
      await verifyPendingOrder({
        orderId: currentPendingVerification.orderId,
        token: currentPendingVerification.token,
      });
      pushThankYou({
        orderId: currentPendingVerification.orderId,
        token: currentPendingVerification.token,
        mode: currentPendingVerification.mode,
      });
    } catch (error) {
      console.error(error);
      setPendingVerification(readPendingOrderVerification());
      setVerificationError(t("verificationFailed"));
      void trackAnalyticsEvent({
        eventName: "order_verification_failed_after_create",
        gaEventName: "order_verification_failed_after_create",
        pageType: "checkout",
        orderId: currentPendingVerification.orderId,
        metadata: {
          storefrontVariant: "new",
          verificationAttempted: true,
          verificationSucceeded: false,
          code: error instanceof StorefrontOrderClientError ? error.code : null,
          status: error instanceof StorefrontOrderClientError ? error.status : null,
        },
      }).catch((analyticsError) => console.error(analyticsError));
    } finally {
      setIsRetryingVerification(false);
    }
  }

  function discardPendingVerification() {
    clearPendingOrderVerification();
    setPendingVerification(null);
    setVerificationError("");
  }

  async function retryPendingSubmission() {
    const currentPendingSubmission = readPendingOrderSubmission();
    if (!currentPendingSubmission) {
      setPendingSubmission(null);
      return;
    }

    if (submissionLockRef.current) {
      return;
    }

    if (readPendingOrderVerification()) {
      setPendingVerification(readPendingOrderVerification());
      setVerificationError(t("verificationFailed"));
      return;
    }

    submissionLockRef.current = true;
    setIsSubmitting(true);
    setVerificationError("");

    try {
      const successfulOrder = await createStorefrontOrder({
        payload: currentPendingSubmission.payload,
        submissionKey: currentPendingSubmission.submissionKey,
      });
      const trackingProducts = cart
        ? cartSummary.items.map((item) => item.product).filter(Boolean)
        : [singleProduct].filter(Boolean);

      persistSuccessfulOrder({
        orderId: successfulOrder.id,
        token: successfulOrder.publicToken,
        mode: "create",
        duplicateSignature: currentPendingSubmission.duplicateSignature,
        snapshot: {
          orderId: successfulOrder.id,
          token: successfulOrder.publicToken,
          modified: false,
          createdAt: new Date().toISOString(),
          firstName: currentPendingSubmission.payload.firstName,
          lastName: currentPendingSubmission.payload.lastName,
          fullName: buildFullName(
            currentPendingSubmission.payload.firstName,
            currentPendingSubmission.payload.lastName,
            currentPendingSubmission.payload.phoneNumber1,
          ),
          email: currentPendingSubmission.payload.email,
          phoneNumber1: currentPendingSubmission.payload.phoneNumber1,
          phoneNumber2: currentPendingSubmission.payload.phoneNumber2,
          delivery: currentPendingSubmission.payload.delivery,
          deliveryFee,
          productSubtotal: subtotal,
          totalAmount,
          state: selectedWilayaName || null,
          city: currentPendingSubmission.payload.city,
          homeAddress: currentPendingSubmission.payload.homeAddress,
          orderProducts: toSnapshotItems({
            cart,
            cartSummary,
            singleProduct,
            quantity,
          }),
        },
      });
      const analyticsItems = buildItemArray(trackingProducts);
      void trackAnalyticsEvent({
        eventName: "order_create_success",
        gaEventName: "order_create_success",
        pageType: "checkout",
        orderId: successfulOrder.id,
        metadata: {
          storefrontVariant: "new",
          verificationAttempted: false,
          verificationSucceeded: false,
          items: analyticsItems,
          delivery,
          state: selectedWilayaName,
          city,
        },
      }).catch((error) => console.error(error));
      void trackAnalyticsEvent({
        eventName: "checkout_submit",
        gaEventName: "checkout_submit",
        pageType: "checkout",
        quantity: currentPendingSubmission.payload.cartProducts.length,
        value: totalAmount,
        orderId: successfulOrder.id,
        metadata: {
          items: analyticsItems,
          delivery,
          state: selectedWilayaName,
          city,
        },
      }).catch((error) => console.error(error));
      enrichPastEvents().catch((error) => console.error(error));
      if (!hasTrackedPurchase(successfulOrder.id)) {
        markPurchaseTracked(successfulOrder.id);
        void handlePurchase({
          products: trackingProducts,
          totalValue: totalAmount,
          eventId: currentPendingSubmission.payload.ev_id,
          eventTime: currentPendingSubmission.payload.time,
          orderId: successfulOrder.id,
          additionalUserData: {
            em: currentPendingSubmission.payload.email,
            fn: currentPendingSubmission.payload.firstName,
            ln: currentPendingSubmission.payload.lastName,
            ph: currentPendingSubmission.payload.phoneNumber1,
            ct: currentPendingSubmission.payload.city,
            st: selectedWilayaName,
            external_id: getOrCreateExternalId(),
          },
        })
          .then((result) => {
            if (result?.metaOk === false) {
              void trackAnalyticsEvent({
                eventName: "purchase_tracking_failed",
                gaEventName: "purchase_tracking_failed",
                pageType: "checkout",
                orderId: successfulOrder.id,
                metadata: {
                  storefrontVariant: "new",
                  metaStatus: result.metaStatus,
                },
              }).catch((analyticsError) => console.error(analyticsError));
            }
          })
          .catch((error) => {
            console.error(error);
            void trackAnalyticsEvent({
              eventName: "purchase_tracking_failed",
              gaEventName: "purchase_tracking_failed",
              pageType: "checkout",
              orderId: successfulOrder.id,
              metadata: {
                storefrontVariant: "new",
                metaStatus: null,
              },
            }).catch((analyticsError) => console.error(analyticsError));
          });
      }
      pushThankYou({
        orderId: successfulOrder.id,
        token: successfulOrder.publicToken,
        mode: "create",
      });
    } catch (error) {
      console.error(error);
      setPendingSubmission(readPendingOrderSubmission());
      void trackAnalyticsEvent({
        eventName: "order_create_failed",
        gaEventName: "order_create_failed",
        pageType: "checkout",
        metadata: {
          storefrontVariant: "new",
          verificationAttempted: false,
          verificationSucceeded: false,
          status: error instanceof StorefrontOrderClientError ? error.status : null,
          code: error instanceof StorefrontOrderClientError ? error.code : null,
        },
      }).catch((analyticsError) => console.error(analyticsError));
      setVerificationError(error instanceof Error ? error.message : String(error));
    } finally {
      submissionLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  function discardPendingSubmission() {
    clearPendingOrderSubmission();
    setPendingSubmission(null);
    setVerificationError("");
  }

  async function saveOrder(event) {
    event.preventDefault();

    if (submissionLockRef.current || isSubmitting) {
      return;
    }

    if (!coreFieldsComplete) {
      setCheckoutAttempted(true);

      if (normalizeText(phoneNumber1) == null) {
        setVerificationError(t("phoneRequiredHint"));
        phoneInputRef.current?.focus();
        return;
      }

      setVerificationError(t("locationRequired"));
      if (selectedWilayaId == null) {
        wilayaSelectRef.current?.focus();
      } else {
        communeSelectRef.current?.focus();
      }
      return;
    }

    const currentPendingVerification = readPendingOrderVerification();
    if (currentPendingVerification) {
      setPendingVerification(currentPendingVerification);
      setVerificationError(t("verificationFailed"));
      return;
    }

    const currentPendingSubmission = readPendingOrderSubmission();
    if (!modify && currentPendingSubmission) {
      if (hasRecentOrderSignature(currentPendingSubmission.duplicateSignature.signature)) {
        setPendingSubmission(currentPendingSubmission);
        setVerificationError(t("pendingSubmissionExists"));
        return;
      }
      setPendingSubmission(currentPendingSubmission);
      setVerificationError(t("pendingSubmissionExists"));
      return;
    }

    if (selectedWilayaId == null || !hasSelectedCommune) {
      setVerificationError(t("locationRequired"));
      return;
    }

    const effectiveCartProducts = cart
      ? cartProducts
      : Array(quantity).fill(singleProduct?._id).filter(Boolean);
    const signature = buildDuplicateSignatureValue({
      phoneNumber1: phoneNumber1.trim(),
      city: normalizeText(city),
      delivery,
      total: totalAmount,
      cartProducts: effectiveCartProducts,
    });

    const duplicateSignature = {
      phoneNumber1: phoneNumber1.trim(),
      city: normalizeText(city),
      delivery,
      total: totalAmount,
      signature,
    };

    if (isDuplicateOrder(duplicateSignature) || hasRecentOrderSignature(signature)) {
      alert("Cette commande a déjà été envoyée récemment...");
      return;
    }

    void trackAnalyticsEvent({
      eventName: "checkout_submit_attempt",
      gaEventName: "checkout_submit_attempt",
      quantity: effectiveCartProducts.length,
      value: totalAmount,
      metadata: {
        ...getAnalyticsContextMetadata({
          paidSession,
          sourceSurface: "checkout",
        }),
        cartMode,
        delivery,
        hasAddress: normalizeText(homeAddress) != null,
        itemCount: effectiveCartProducts.length,
      },
    }).catch((error) => console.error(error));

    submissionLockRef.current = true;
    setIsSubmitting(true);
    setCheckoutAttempted(false);
    setVerificationError("");
    writeRecentOrderSignature(signature);

    storage?.setItem("firstName", firstName);
    storage?.setItem("lastName", lastName);
    storage?.setItem("state", selectedWilayaName);
    if (selectedWilayaId == null) {
      storage?.removeItem("stateCode");
    } else {
      storage?.setItem("stateCode", String(selectedWilayaId));
    }
    storage?.setItem("city", city);
    storage?.setItem("homeAddress", homeAddress);
    storage?.setItem("phoneNumber1", phoneNumber1);
    storage?.setItem("phoneNumber2", phoneNumber2);
    storage?.setItem("email", email);
    storage?.setItem("cartProducts", effectiveCartProducts.join(","));
    storage?.setItem("delivery", delivery);
    storage?.setItem("del_pr", String(deliveryFee));
    storage?.setItem("subtotal", String(subtotal));

    const eventTime = Math.floor(Date.now() / 1000);
    const eventId = uuidv4();
    const normalizedFirstName = normalizeText(firstName);
    const normalizedLastName = normalizeText(lastName);
    const normalizedEmail = normalizeText(email);
    const normalizedPhoneNumber1 = phoneNumber1.trim();
    const normalizedPhoneNumber2 = normalizeText(phoneNumber2);
    const normalizedCity = normalizeText(city);
    const normalizedAddress = normalizeText(homeAddress);
    const snapshotItems = toSnapshotItems({
      cart,
      cartSummary,
      singleProduct,
      quantity,
    });
    const storefrontPayload = {
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      email: normalizedEmail,
      phoneNumber1: normalizedPhoneNumber1,
      phoneNumber2: normalizedPhoneNumber2,
      cartProducts: effectiveCartProducts,
      delivery: delivery === "office" ? 1 : 0,
      state: selectedWilayaId,
      city: normalizedCity,
      homeAddress: normalizedAddress,
      note: null,
      visitId: getVisitIdFromCookie(),
      journeyId: getOrCreateJourneyId(),
      sessionId: getOrCreateSessionId(),
    };

    try {
      let successfulOrder;
      const trackingProducts = cart
        ? cartSummary.items.map((item) => item.product).filter(Boolean)
        : [singleProduct].filter(Boolean);

      if (modify) {
        const orderId = storage?.getItem("orderId");
        const orderToken = storage?.getItem("orderToken");

        if (!orderId || !orderToken) {
          throw new StorefrontOrderClientError(t("verificationFailed"), {
            code: "missing_order_identity",
          });
        }

        successfulOrder = await patchStorefrontOrder({
          orderId,
          token: orderToken,
          payload: storefrontPayload,
        });
        persistSuccessfulOrder({
          orderId: successfulOrder.id,
          token: orderToken,
          mode: "patch",
          duplicateSignature,
          snapshot: {
            orderId: successfulOrder.id,
            token: orderToken,
            modified: true,
            createdAt: new Date().toISOString(),
            firstName: normalizedFirstName,
            lastName: normalizedLastName,
            fullName: buildFullName(normalizedFirstName, normalizedLastName, normalizedPhoneNumber1),
            email: normalizedEmail,
            phoneNumber1: normalizedPhoneNumber1,
            phoneNumber2: normalizedPhoneNumber2,
            delivery: storefrontPayload.delivery,
            deliveryFee,
            productSubtotal: subtotal,
            totalAmount,
            state: selectedWilayaName || null,
            city: normalizedCity,
            homeAddress: normalizedAddress,
            orderProducts: snapshotItems,
          },
        });
        pushThankYou({
          orderId: successfulOrder.id,
          token: orderToken,
          mode: "patch",
        });
      } else {
        const pendingCreateSubmission = {
          submissionKey: uuidv4(),
          payload: {
            ...storefrontPayload,
            time: eventTime,
            ev_id: eventId,
            url: pathname,
            fbp: getCookie("_fbp") || null,
            fbc: getCookie("_fbc") || null,
          },
          duplicateSignature,
          createdAt: new Date().toISOString(),
        };

        writePendingOrderSubmission(pendingCreateSubmission);
        setPendingSubmission(readPendingOrderSubmission());

        successfulOrder = await createStorefrontOrder({
          payload: pendingCreateSubmission.payload,
          submissionKey: pendingCreateSubmission.submissionKey,
        });
        persistSuccessfulOrder({
          orderId: successfulOrder.id,
          token: successfulOrder.publicToken,
          mode: "create",
          duplicateSignature,
          snapshot: {
            orderId: successfulOrder.id,
            token: successfulOrder.publicToken,
            modified: false,
            createdAt: new Date().toISOString(),
            firstName: normalizedFirstName,
            lastName: normalizedLastName,
            fullName: buildFullName(normalizedFirstName, normalizedLastName, normalizedPhoneNumber1),
            email: normalizedEmail,
            phoneNumber1: normalizedPhoneNumber1,
            phoneNumber2: normalizedPhoneNumber2,
            delivery: storefrontPayload.delivery,
            deliveryFee,
            productSubtotal: subtotal,
            totalAmount,
            state: selectedWilayaName || null,
            city: normalizedCity,
            homeAddress: normalizedAddress,
            orderProducts: snapshotItems,
          },
        });
        const analyticsItems = buildItemArray(trackingProducts);
        void trackAnalyticsEvent({
          eventName: "order_create_success",
          gaEventName: "order_create_success",
          pageType: "checkout",
          orderId: successfulOrder.id,
          metadata: {
            storefrontVariant: "new",
            verificationAttempted: false,
            verificationSucceeded: false,
            items: analyticsItems,
            delivery,
            state: selectedWilayaName,
            city,
          },
        }).catch((error) => console.error(error));
        void trackAnalyticsEvent({
          eventName: "checkout_submit",
          gaEventName: "checkout_submit",
          pageType: "checkout",
          quantity: effectiveCartProducts.length,
          value: totalAmount,
          orderId: successfulOrder.id,
          metadata: {
            items: analyticsItems,
            delivery,
            state: selectedWilayaName,
            city,
          },
        }).catch((error) => console.error(error));
        enrichPastEvents().catch((error) => console.error(error));
        if (!hasTrackedPurchase(successfulOrder.id)) {
          markPurchaseTracked(successfulOrder.id);
          void handlePurchase({
            products: trackingProducts,
            totalValue: totalAmount,
            eventId,
            eventTime,
            orderId: successfulOrder.id,
            additionalUserData: {
              em: normalizedEmail,
              fn: normalizedFirstName,
              ln: normalizedLastName,
              ph: normalizedPhoneNumber1,
              ct: normalizedCity,
              st: selectedWilayaName,
              external_id: getOrCreateExternalId(),
            },
          })
            .then((result) => {
              if (result?.metaOk === false) {
                void trackAnalyticsEvent({
                  eventName: "purchase_tracking_failed",
                  gaEventName: "purchase_tracking_failed",
                  pageType: "checkout",
                  orderId: successfulOrder.id,
                  metadata: {
                    storefrontVariant: "new",
                    metaStatus: result.metaStatus,
                  },
                }).catch((analyticsError) => console.error(analyticsError));
              }
            })
            .catch((error) => {
              console.error(error);
              void trackAnalyticsEvent({
                eventName: "purchase_tracking_failed",
                gaEventName: "purchase_tracking_failed",
                pageType: "checkout",
                orderId: successfulOrder.id,
                metadata: {
                  storefrontVariant: "new",
                  metaStatus: null,
                },
              }).catch((analyticsError) => console.error(analyticsError));
            });
        }
        pushThankYou({
          orderId: successfulOrder.id,
          token: successfulOrder.publicToken,
          mode: "create",
        });
      }
    } catch (error) {
      console.error(error);
      void trackAnalyticsEvent({
        eventName: "api_error",
        gaEventName: "exception",
        pageType: "checkout",
        metadata: {
          kind: "checkout_submit_exception",
          status: error instanceof StorefrontOrderClientError ? error.status : null,
          code: error instanceof StorefrontOrderClientError ? error.code : null,
          message: String(error),
        },
      });
      if (error instanceof StorefrontOrderClientError && error.code.startsWith("invalid_")) {
        setVerificationError(t("submissionInvalidResponse"));
      } else {
        if (!modify) {
          setPendingSubmission(readPendingOrderSubmission());
        }
        if (!modify) {
          void trackAnalyticsEvent({
            eventName: "order_create_failed",
            gaEventName: "order_create_failed",
            pageType: "checkout",
            metadata: {
              storefrontVariant: "new",
              verificationAttempted: false,
              verificationSucceeded: false,
              status: error instanceof StorefrontOrderClientError ? error.status : null,
              code: error instanceof StorefrontOrderClientError ? error.code : null,
            },
          }).catch((analyticsError) => console.error(analyticsError));
        }
        setVerificationError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      submissionLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  const deliveryAvailable = deliveryFee > 0 || hasFreeShippingProduct;

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="sf-panel pb-28 lg:pb-6">
          <div className="flex justify-center lg:justify-start">
            <PhoneBadge />
          </div>

          {pendingSubmission ? (
            <div className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-950">
              <p className="font-semibold">{t("savedOrderTitle")}</p>
              <p className="mt-2">{t("savedOrderBody")}</p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={retryPendingSubmission}
                  disabled={isSubmitting || isRetryingVerification}
                  className="sf-button w-full justify-center sm:w-auto"
                >
                  {isSubmitting ? t("verifying") : t("retrySubmission")}
                </button>
                <button
                  type="button"
                  onClick={discardPendingSubmission}
                  disabled={isSubmitting || isRetryingVerification}
                  className="sf-button-secondary w-full justify-center sm:w-auto"
                >
                  {t("discardPendingSubmission")}
                </button>
              </div>
            </div>
          ) : null}

          {pendingVerification ? (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
              <p className="font-semibold">{t("verificationFailed")}</p>
              <p className="mt-2">{t("verifying")}</p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={retryPendingVerification}
                  disabled={isRetryingVerification || isSubmitting}
                  className="sf-button w-full justify-center sm:w-auto"
                >
                  {isRetryingVerification ? t("verifying") : t("retryVerification")}
                </button>
                <button
                  type="button"
                  onClick={discardPendingVerification}
                  disabled={isRetryingVerification || isSubmitting}
                  className="sf-button-secondary w-full justify-center sm:w-auto"
                >
                  {t("discardPendingVerification")}
                </button>
              </div>
            </div>
          ) : null}

          {verificationError ? (
            <p className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {verificationError}
            </p>
          ) : null}

          <form id="checkout-order-form" onSubmit={saveOrder} className="mt-6 space-y-6" noValidate>
            <section className="rounded-[1.75rem] border border-teal-200 bg-gradient-to-br from-teal-50 via-white to-emerald-50 p-5 shadow-sm">
              <p className="sf-kicker">{t("fastTitle")}</p>
              <h2 className="mt-3 text-2xl font-semibold text-slate-900">{t("fastTitle")}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{t("fastSubtitle")}</p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-900 sm:col-span-2">
                  {t("tel")}
                  <input
                    ref={phoneInputRef}
                    required
                    value={phoneNumber1}
                    onChange={(e) => setPhoneNumber1(e.target.value)}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder={t("phonePlaceholder")}
                    className="sf-input mt-2"
                  />
                  <span className="mt-2 block text-xs font-medium leading-5 text-slate-500">
                    {t("phoneHelp")}
                  </span>
                </label>

                <div>
                  <label className="block text-sm font-semibold text-slate-700">
                    {t("wil")}
                  </label>
                  <select
                    ref={wilayaSelectRef}
                    required
                    value={selectedWilayaId ?? ""}
                    onChange={(e) => {
                      const wilaya = deliveryCatalog?.wilayas.find(
                        (item) => item.wilayaId === Number(e.target.value),
                      );
                      setSelectedWilayaId(wilaya?.wilayaId ?? null);
                      setSelectedWilayaName(wilaya?.name ?? "");
                      setCity("");
                      setShowOfficeFallbackNotice(false);
                    }}
                    aria-invalid={checkoutAttempted && selectedWilayaId == null ? "true" : undefined}
                    aria-describedby={showLocationRequiredHint ? "checkout-location-error" : undefined}
                    className="sf-select mt-2"
                  >
                    <option value="">{t("wil")}</option>
                    {(deliveryCatalog?.wilayas ?? []).map((wilaya) => (
                      <option key={wilaya.wilayaId} value={wilaya.wilayaId}>
                        {wilaya.wilayaId}. {wilaya.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700">
                    {t("comm")}
                  </label>
                  <select
                    ref={communeSelectRef}
                    required
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value);
                      setShowOfficeFallbackNotice(false);
                    }}
                    aria-invalid={checkoutAttempted && !hasSelectedCommune ? "true" : undefined}
                    aria-describedby={showLocationRequiredHint ? "checkout-location-error" : undefined}
                    className="sf-select mt-2"
                    disabled={selectedWilayaId == null || availableCommunes.length === 0}
                  >
                    <option value="">{t("comm")}</option>
                    {availableCommunes.map((commune) => (
                      <option key={commune.communeId} value={commune.name}>
                        {formatCommuneOptionLabel(commune, stopDeskSuffix)}
                      </option>
                    ))}
                  </select>
                  {showLocationRequiredHint ? (
                    <p id="checkout-location-error" className="mt-2 text-xs font-semibold text-rose-600">
                      {t("locationRequired")}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-5">
                <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {t("selec")}
                </label>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label htmlFor="rad1">
                    <div className={`sf-chip flex min-h-[3.25rem] w-full justify-center px-4 py-3 text-center leading-snug whitespace-normal ${delivery === "home" ? " sf-chip-active " : ""}`}>
                      <input
                        type="radio"
                        className="appearance-none"
                        id="rad1"
                        name="livraison"
                        value="home"
                        checked={delivery === "home"}
                        onChange={(e) => handleDeliveryChange(e.target.value)}
                      />
                      <span className="font-medium">{t("dom")}</span>
                    </div>
                  </label>
                  <label htmlFor="rad2">
                    <div className={`sf-chip flex min-h-[3.25rem] w-full justify-center px-4 py-3 text-center leading-snug whitespace-normal ${delivery === "office" ? " sf-chip-active " : ""}${!officeAvailable ? " opacity-50" : ""}`}>
                      <input
                        type="radio"
                        className="appearance-none"
                        id="rad2"
                        name="livraison"
                        value="office"
                        checked={delivery === "office"}
                        onChange={(e) => handleDeliveryChange(e.target.value)}
                        disabled={!officeAvailable}
                      />
                      <span className="font-medium">{t("off")}</span>
                    </div>
                  </label>
                </div>
              </div>

              {showOfficeFallbackNotice ? (
                <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {t("officeFallbackNotice")}
                </p>
              ) : null}
            </section>

            <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {t("optionalDetailsTitle")}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {t("optionalDetailsBody")}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {t("optionalBadge")}
                </span>
              </div>

              {!optionalDetailsExpanded ? (
                <button
                  type="button"
                  onClick={expandOptionalDetails}
                  className="sf-button-secondary mt-4 justify-center"
                >
                  {t("optionalDetailsToggle")}
                </button>
              ) : (
                <div className="mt-5 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm font-semibold text-slate-700">
                      {t("pre")}
                      <input
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        type="text"
                        className="sf-input mt-2"
                      />
                    </label>
                    <label className="block text-sm font-semibold text-slate-700">
                      {t("nom")}
                      <input
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        type="text"
                        className="sf-input mt-2"
                      />
                    </label>
                  </div>

                  <label className="block text-sm font-semibold text-slate-700">
                    {t("mail")}
                    <input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      type="email"
                      className="sf-input mt-2"
                    />
                  </label>

                  <label className="block text-sm font-semibold text-slate-700">
                    {t("addr")}
                    <input
                      value={homeAddress}
                      onChange={(e) => setHomeAddress(e.target.value)}
                      type="text"
                      className="sf-input mt-2"
                    />
                    <span className="mt-2 block text-xs font-medium leading-5 text-slate-500">
                      {t(addressHelperKey)}
                    </span>
                  </label>
                </div>
              )}
            </section>

            {!cart ? (
              <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
                <label className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {t("quant")}
                </label>
                <div dir="ltr" className="mt-3 inline-flex w-full items-center justify-center">
                  <button
                    type="button"
                    onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                    className="sf-button h-12 w-14 rounded-r-none"
                  >
                    -
                  </button>
                  <div className="flex h-12 w-20 items-center justify-center border-y border-slate-300 bg-white text-2xl font-bold text-slate-900">
                    {quantity}
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuantity((value) => value + 1)}
                    className="sf-button h-12 w-14 rounded-l-none"
                  >
                    +
                  </button>
                </div>
              </section>
            ) : null}
          </form>
        </section>

        <aside className="space-y-6">
          <section className="sf-panel lg:sticky lg:top-28">
            <p className="sf-kicker">{t("tot")}</p>
            <h3 className="mt-3 text-2xl font-semibold text-slate-900">{t("summaryTitle")}</h3>

            <div className="mt-5 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <div className="sf-metric mt-0">
                <span className="font-semibold text-slate-700">{t("sous")}</span>
                <span className="font-bold text-teal-700">
                  {subtotal}
                  {t("da")}
                </span>
              </div>

              {deliveryAvailable ? (
                <>
                  <div className="sf-metric">
                    <span className="font-semibold text-slate-700">{t("liv")}</span>
                    <span className="font-bold text-teal-700">
                      {deliveryFee}
                      {t("da")}
                    </span>
                  </div>
                  <div className="sf-metric border-b-0">
                    <span className="font-semibold text-slate-900">{t("tot")}</span>
                    <span className="text-xl font-bold text-teal-700">
                      {totalAmount}
                      {t("da")}
                    </span>
                  </div>
                </>
              ) : (
                <span className="mt-4 block font-semibold text-red-500">{t("pd")}</span>
              )}
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600">{t("summaryReassurance")}</p>

            {subtotal > 0 ? (
              <>
                <button
                  type="submit"
                  form="checkout-order-form"
                  disabled={submitDisabled}
                  className={`${modify ? "sf-button" : "sf-button-accent"} mt-6 w-full justify-center disabled:opacity-60`}
                >
                  {isSubmitting ? t("verifying") : modify ? t("modi") : t("conf")}
                </button>
                <p className="mt-3 text-sm leading-6 text-slate-600">{t("motivationLine")}</p>
                {!coreFieldsComplete ? (
                  <p className="mt-2 text-xs font-medium text-slate-500">
                    {t("phoneRequiredHint")}
                  </p>
                ) : null}
              </>
            ) : null}
          </section>
        </aside>
      </div>

      {subtotal > 0 && showMobileStickySubmit ? (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur lg:hidden">
          <div className="sf-container px-0">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1 rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {t("tot")}
                </div>
                <div className="truncate text-lg font-bold text-teal-700">
                  {totalAmount}
                  {t("da")}
                </div>
              </div>
              <button
                type="submit"
                form="checkout-order-form"
                disabled={submitDisabled}
                className={`${modify ? "sf-button" : "sf-button-accent"} flex-1 justify-center disabled:opacity-60`}
              >
                {isSubmitting ? t("verifying") : modify ? t("modi") : t("conf")}
              </button>
            </div>
            {!coreFieldsComplete ? (
              <p className="mt-2 text-center text-xs font-medium text-slate-500">
                {t("stickySubmitHelper")}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
