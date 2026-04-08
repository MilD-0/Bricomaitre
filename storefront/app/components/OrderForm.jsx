"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useContext } from "react";
import { v4 as uuidv4 } from "uuid";
import { getCookie } from "cookies-next";

import { CartContext } from "./cartContext";
import PhoneBadge from "./PhoneBadge";
import SimBrand from "./SimBrand";
import {
  enrichPastEvents,
  getOrCreateExternalId,
  handlePurchase,
} from "./Init";
import {
  buildItemArray,
  getOrCreateJourneyId,
  getOrCreateSessionId,
  trackAnalyticsEvent,
} from "@/lib/analytics";
import {
  findDeliveryFee,
  findWilayaByName,
  getCommunesForWilaya,
} from "@/lib/storefront-api";
import {
  clearPendingOrderVerification,
  readPendingOrderVerification,
  writePendingOrderVerification,
} from "@/lib/pending-order-verification";
import {
  StorefrontOrderClientError,
  createStorefrontOrder,
  patchStorefrontOrder,
  readVerifiedStorefrontOrder,
} from "@/lib/storefront-order-client";
import { usePathname, useRouter } from "@/i18n/navigation";

const FREE_SHIPPING_PRODUCT_ID = "f00000000000000000000005";

export default function OrderForm({ prod, cart, order }) {
  const t = useTranslations("checkout");
  const router = useRouter();
  const pathname = usePathname() || "none";
  const storage = typeof window !== "undefined" ? window.localStorage : null;
  const modify = Boolean(order);

  const { clearCart, cartProducts, cartSummary, rememberProducts, setCart } = useContext(CartContext);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [products, setProducts] = useState([]);
  const [singleProduct, setSingleProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [deliveryCatalog, setDeliveryCatalog] = useState(null);
  const [pendingVerification, setPendingVerification] = useState(null);
  const [verificationError, setVerificationError] = useState("");
  const [isRetryingVerification, setIsRetryingVerification] = useState(false);

  const [firstName, setFirstName] = useState(storage?.getItem("firstName") || "");
  const [lastName, setLastName] = useState(storage?.getItem("lastName") || "");
  const [homeAddress, setHomeAddress] = useState(
    storage?.getItem("homeAddress") || "",
  );
  const [phoneNumber1, setPhoneNumber1] = useState(
    storage?.getItem("phoneNumber1") || "",
  );
  const [phoneNumber2, setPhoneNumber2] = useState(
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

  useEffect(() => {
    if (modify) {
      setCart();
    }
  }, [modify, setCart]);

  useEffect(() => {
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
    const initialWilaya = fromCode ?? fromName ?? deliveryCatalog.wilayas[0] ?? null;

    if (initialWilaya) {
      setSelectedWilayaId(initialWilaya.wilayaId);
      setSelectedWilayaName(initialWilaya.name);
    }
  }, [deliveryCatalog, selectedWilayaId, storage]);

  useEffect(() => {
    if (!cart || cartProducts.length === 0) {
      const snapshotProducts = cartSummary.items.map((item) => item.product).filter(Boolean);
      setProducts(snapshotProducts);
      return;
    }

    const snapshotProducts = cartSummary.items.map((item) => item.product).filter(Boolean);
    if (snapshotProducts.length > 0) {
      setProducts(snapshotProducts);
    }

    const loadCartProducts = async () => {
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
        setProducts(data);
      } catch (error) {
        console.error(error);
      }
    };

    loadCartProducts();
  }, [cart, cartProducts, cartSummary.items, rememberProducts]);

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
  const officeAvailable = selectedCommune ? selectedCommune.hasStopDesk : true;

  useEffect(() => {
    if (city && !availableCommunes.some((commune) => commune.name === city)) {
      setCity("");
    }
  }, [availableCommunes, city]);

  useEffect(() => {
    if (delivery === "office" && city && !officeAvailable) {
      setDelivery("home");
      setShowOfficeFallbackNotice(true);
      return;
    }

    if (!city || officeAvailable) {
      setShowOfficeFallbackNotice(false);
    }
  }, [city, delivery, officeAvailable]);

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
        parsedLastOrder.total === currentOrder.total
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

  async function verifyAndComplete({ orderId, token, mode, duplicateSignature }) {
    writePendingOrderVerification({
      orderId,
      token,
      mode,
      createdAt: new Date().toISOString(),
    });
    setPendingVerification(readPendingOrderVerification());

    const verifiedOrder = await readVerifiedStorefrontOrder({ orderId, token });

    clearPendingOrderVerification();
    setPendingVerification(null);
    setVerificationError("");

    storage?.setItem("orderId", String(orderId));
    storage?.setItem("orderToken", token);
    if (duplicateSignature) {
      storage?.setItem(
        "lastOrder",
        JSON.stringify({
          ...duplicateSignature,
          timestamp: Date.now(),
        }),
      );
    }

    clearCart();

    const search = new URLSearchParams({
      orderId: String(orderId),
      token,
      ...(mode === "patch" ? { modified: "true" } : {}),
    });
    router.push(`/thank-you?${search.toString()}`);

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
      await verifyAndComplete({
        orderId: currentPendingVerification.orderId,
        token: currentPendingVerification.token,
        mode: currentPendingVerification.mode,
        duplicateSignature: null,
      });
    } catch (error) {
      console.error(error);
      setPendingVerification(readPendingOrderVerification());
      setVerificationError(t("verificationFailed"));
    } finally {
      setIsRetryingVerification(false);
    }
  }

  function discardPendingVerification() {
    clearPendingOrderVerification();
    setPendingVerification(null);
    setVerificationError("");
  }

  async function saveOrder(event) {
    event.preventDefault();

    if (isSubmitting || selectedWilayaId == null || !city) {
      return;
    }

    const currentPendingVerification = readPendingOrderVerification();
    if (currentPendingVerification) {
      setPendingVerification(currentPendingVerification);
      setVerificationError(t("verificationFailed"));
      return;
    }

    const effectiveCartProducts = cart
      ? cartProducts
      : Array(quantity).fill(singleProduct?._id).filter(Boolean);

    const duplicateSignature = {
      phoneNumber1,
      city,
      delivery,
      total: totalAmount,
    };

    if (isDuplicateOrder(duplicateSignature)) {
      alert("Cette commande a déjà été envoyée récemment...");
      return;
    }

    setIsSubmitting(true);
    setVerificationError("");

    storage?.setItem("firstName", firstName);
    storage?.setItem("lastName", lastName);
    storage?.setItem("state", selectedWilayaName);
    storage?.setItem("stateCode", String(selectedWilayaId));
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
    const storefrontPayload = {
      firstName,
      lastName,
      email: email || null,
      phoneNumber1,
      phoneNumber2: phoneNumber2 || null,
      cartProducts: effectiveCartProducts,
      delivery: delivery === "office" ? 1 : 0,
      state: selectedWilayaId,
      city,
      homeAddress,
      note: null,
      journeyId: getOrCreateJourneyId(),
      sessionId: getOrCreateSessionId(),
    };

    try {
      let successfulOrder;
      let verifiedOrder;

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
        verifiedOrder = await verifyAndComplete({
          orderId: successfulOrder.id,
          token: orderToken,
          mode: "patch",
          duplicateSignature,
        });
      } else {
        successfulOrder = await createStorefrontOrder({
          payload: {
            ...storefrontPayload,
            time: eventTime,
            ev_id: eventId,
            url: pathname,
            fbp: getCookie("_fbp") || null,
            fbc: getCookie("_fbc") || null,
          },
          submissionKey: uuidv4(),
        });
        verifiedOrder = await verifyAndComplete({
          orderId: successfulOrder.id,
          token: successfulOrder.publicToken,
          mode: "create",
          duplicateSignature,
        });
      }

      if (!modify) {
        const analyticsItems = buildItemArray(cart ? products : [singleProduct].filter(Boolean));
        void trackAnalyticsEvent({
          eventName: "checkout_submit",
          gaEventName: "checkout_submit",
          pageType: "checkout",
          quantity: effectiveCartProducts.length,
          value: totalAmount,
          orderId: verifiedOrder?.id ?? successfulOrder?.id ?? null,
          metadata: {
            items: analyticsItems,
            delivery,
            state: selectedWilayaName,
            city,
          },
        }).catch((error) => console.error(error));
        enrichPastEvents().catch((error) => console.error(error));
        void handlePurchase({
          products: cart ? products : [singleProduct],
          totalValue: totalAmount,
          eventId,
          eventTime,
          orderId: verifiedOrder?.id ?? successfulOrder?.id ?? null,
          additionalUserData: {
            em: email,
            fn: firstName,
            ln: lastName,
            ph: phoneNumber1,
            ct: city,
            st: selectedWilayaName,
            external_id: getOrCreateExternalId(),
          },
        }).catch((error) => console.error(error));
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
      } else if (
        error instanceof StorefrontOrderClientError
        && (error.code === "verification_failed" || error.code === "invalid_read_response")
      ) {
        setPendingVerification(readPendingOrderVerification());
        setVerificationError(t("verificationFailed"));
      } else {
        setVerificationError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="sf-panel">
      <div className="flex justify-center lg:justify-start">
        <PhoneBadge />
      </div>

      <h1 className="mt-8 text-3xl font-semibold tracking-tight text-slate-900">{t("info")}:</h1>
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
      <form id="checkout-order-form" onSubmit={saveOrder} className="mt-6">
        <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          {t("nom")}
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} type="text" className="sf-input mt-2 mb-6" />
        </label>
        <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          {t("pre")}
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} type="text" className="sf-input mt-2 mb-6" />
        </label>
        <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{t("wil")}</label>
        <select
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
          className="sf-select mt-2 mb-6"
        >
          <option value="">{t("wil")}</option>
          {(deliveryCatalog?.wilayas ?? []).map((wilaya) => (
            <option key={wilaya.wilayaId} value={wilaya.wilayaId}>
              {wilaya.wilayaId}. {wilaya.name}
            </option>
          ))}
        </select>

        <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{t("comm")}</label>
        <select
          value={city}
          onChange={(e) => {
            setCity(e.target.value);
            setShowOfficeFallbackNotice(false);
          }}
          className="sf-select mt-2 mb-6"
          disabled={availableCommunes.length === 0}
          required
        >
          <option value="">-- {t("comm")} --</option>
          {availableCommunes.map((commune) => (
            <option key={commune.communeId} value={commune.name}>
              {commune.name}
            </option>
          ))}
        </select>

        <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          {t("addr")}
          <input value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} type="text" className="sf-input mt-2 mb-6" />
        </label>
        <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          {t("tel")}
          <input required value={phoneNumber1} onChange={(e) => setPhoneNumber1(e.target.value)} type="tel" className="sf-input mt-2 mb-6" />
        </label>
        <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          {t("mail")}
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="sf-input mt-2 mb-6" />
        </label>

        <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{t("selec")}</label>
        <div className="mt-2 mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:mx-12">
          <label htmlFor="rad1">
            <div className={"sf-chip mb-2 flex min-h-[3.25rem] w-full justify-center px-4 py-3 text-center leading-snug whitespace-normal " + (delivery === "home" ? " sf-chip-active " : "")}>
              <input type="radio" className="appearance-none" id="rad1" name="livraison" value="home" checked={delivery === "home"} onChange={(e) => handleDeliveryChange(e.target.value)} />
              <span className="font-medium">{t("dom")}</span>
            </div>
          </label>
          <label htmlFor="rad2">
            <div className={"sf-chip mb-2 flex min-h-[3.25rem] w-full justify-center px-4 py-3 text-center leading-snug whitespace-normal " + (delivery === "office" ? " sf-chip-active " : "") + (!officeAvailable ? " opacity-50" : "")}>
              <input type="radio" className="appearance-none" id="rad2" name="livraison" value="office" checked={delivery === "office"} onChange={(e) => handleDeliveryChange(e.target.value)} disabled={!officeAvailable} />
              <span className="font-medium">{t("off")}</span>
            </div>
          </label>
        </div>

        {showOfficeFallbackNotice ? (
          <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {t("officeFallbackNotice")}
          </p>
        ) : null}

        {!cart && (
          <div>
            <label className="text-lg">{t("quant")}</label>
            <div dir="ltr" className="mt-2 inline-flex w-full items-center justify-center">
              <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="sf-button h-12 w-14 rounded-r-none">-</button>
              <div className="flex h-12 w-20 items-center justify-center border-y border-slate-300 bg-white text-2xl font-bold text-slate-900">{quantity}</div>
              <button type="button" onClick={() => setQuantity((value) => value + 1)} className="sf-button h-12 w-14 rounded-l-none">+</button>
            </div>
          </div>
        )}
      </form>
      </section>

      <aside className="space-y-6">
        <section className="sf-panel lg:sticky lg:top-28">
          <p className="sf-kicker">{t("tot")}</p>
          <div className="sf-metric mt-4">
            <span className="font-semibold text-slate-700">{t("sous")}</span>
            <span className="font-bold text-teal-700">{subtotal}{t("da")}</span>
          </div>
          {deliveryFee > 0 || hasFreeShippingProduct ? (
            <>
              <div className="sf-metric">
                <span className="font-semibold text-slate-700">{t("liv")}</span>
                <span className="font-bold text-teal-700">{deliveryFee}{t("da")}</span>
              </div>
              <div className="sf-metric border-b-0">
                <span className="font-semibold text-slate-900">{t("tot")}</span>
                <span className="text-xl font-bold text-teal-700">{totalAmount}{t("da")}</span>
              </div>
            </>
          ) : (
            <span className="mt-4 block font-semibold text-red-500">{t("pd")}</span>
          )}

          {subtotal > 0 ? (
            <button
              type="submit"
              form="checkout-order-form"
              disabled={isSubmitting || pendingVerification != null}
              className={`${modify ? "sf-button" : "sf-button-accent"} mt-6 w-full justify-center disabled:opacity-60`}
            >
              {isSubmitting ? t("verifying") : modify ? t("modi") : t("conf")}
            </button>
          ) : null}

        </section>
      </aside>

      {subtotal < 1490 ? (
        <div className="w-full">
          <SimBrand brandid="f00000000000000000000006" />
        </div>
      ) : null}
    </div>
  );
}
