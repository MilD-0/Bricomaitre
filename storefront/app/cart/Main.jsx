"use client";
import Layout from "../components/layout";
import { useContext, useEffect, useEffectEvent, useRef, useState } from "react";
import { CartContext } from "../components/cartContext";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { handleInitiateCheckout } from "../components/Init";
import {
  buildItemArray,
  getAnalyticsContextMetadata,
  trackAnalyticsEvent,
} from "@/lib/analytics";
import { isPaidTrafficSession } from "@/lib/paid-session";
import { Link, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";

function waitForTracking(promise, timeoutMs = 250) {
  return Promise.race([
    promise.catch((error) => {
      console.error("InitiateCheckout error:", error);
    }),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

function CartPage() {
  const t = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { cartProducts, addProduct, removeProduct, cartSummary, rememberProducts } = useContext(CartContext);
  const [products, setProducts] = useState([]);
  const lastLoadedCartKeyRef = useRef("");
  const paidSession = isPaidTrafficSession();
  const checkoutHref = (() => {
    const query = searchParams?.toString() ?? "";
    return query ? `/checkout?${query}` : "/checkout";
  })();

  useEffect(() => {
    if (cartProducts.length === 0) {
      setProducts([]);
    } else {
      const snapshotProducts = cartSummary.items
        .map((item) => item.product)
        .filter(Boolean);

      if (snapshotProducts.length > 0) {
        setProducts(snapshotProducts);
      }
    }
  }, [cartProducts, cartSummary.items]);

  const loadCartProducts = useEffectEvent(async () => {
    fetch("/api/cart", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids: cartProducts }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to fetch products");
        }
        return response.json();
      })
      .then((data) => {
        rememberProducts(data);
        setProducts(data);
      })
      .catch((error) => {
        console.error(error);
      });
  });

  useEffect(() => {
    if (cartProducts.length === 0) {
      lastLoadedCartKeyRef.current = "";
      return;
    }

    const cartKey = cartProducts.join(",");
    if (lastLoadedCartKeyRef.current === cartKey) {
      return;
    }

    lastLoadedCartKeyRef.current = cartKey;
    void loadCartProducts();
  }, [cartProducts]);

  useEffect(() => {
    if (products.length === 0) {
      return;
    }

    const items = buildItemArray(products);
    const totalValue = cartSummary.subtotal;

    void trackAnalyticsEvent({
      eventName: "view_cart",
      gaEventName: "view_cart",
      quantity: cartProducts.length,
      value: totalValue,
      metadata: {
        items,
      },
      gaParams: {
        currency: "DZD",
        value: totalValue,
        items,
      },
    });
  }, [products, cartProducts, cartSummary.subtotal]);

  const total = cartSummary.subtotal;

  async function goToCheckout() {
    void trackAnalyticsEvent({
      eventName: "cart_checkout_click",
      gaEventName: "cart_checkout_click",
      quantity: cartProducts.length,
      value: total,
      metadata: {
        ...getAnalyticsContextMetadata({
          paidSession,
          sourceSurface: "cart",
        }),
        cartItemCount: cartProducts.length,
        cartSubtotal: total,
      },
    }).catch((error) => console.error(error));

    await waitForTracking(handleInitiateCheckout({
      products,
      totalValue: total,
    }));
    router.push(checkoutHref);
  }

  if (!cartProducts?.length) {
    return (
      <Layout>
        <section className="sf-container py-8">
          <div className="sf-panel text-center">
            <h1 className="text-2xl font-semibold text-slate-900">{t("pdp")}...</h1>
            <p className="mt-3 text-sm text-slate-600">Votre panier est vide pour le moment.</p>
            <Link href={"/products"} className="sf-button mt-6">
              {t("vrd")}
            </Link>
          </div>
        </section>
      </Layout>
    );
  }

  return (
    <Layout>
      <section className="sf-container grid gap-6 pb-28 pt-6 lg:grid-cols-[1.1fr_0.9fr] lg:pb-6">
        <div className="space-y-4">
          {products.map((product) => {
            const quantity = cartProducts.filter((id) => id === product._id).length;
            return (
              <article key={product._id} className="sf-panel grid grid-cols-[110px_1fr_auto] items-center gap-4">
                <Link href={`/products/${product.slug}`} className="sf-image-frame aspect-square p-3">
                  <Image
                    src={product.images[0]}
                    alt="product image"
                    width={180}
                    height={180}
                    className="h-full w-full object-contain"
                    sizes="110px"
                  />
                </Link>

                <div className="min-w-0">
                  <Link href={`/products/${product.slug}`} className="line-clamp-2 text-sm font-semibold text-slate-900 hover:text-teal-700 md:text-base">
                    {t("prodt", {
                      name: product.title,
                      namear: product.title_ar.length > 2 ? product.title_ar : product.title,
                    })}
                  </Link>
                  <p className="mt-2 text-lg font-bold text-teal-700">
                    {product.price}
                    {t("da")}
                  </p>
                </div>

                <div className="flex flex-col items-center gap-2">
                  <button onClick={() => addProduct(product._id, product)} className="sf-chip h-10 w-10 p-0">
                    +
                  </button>
                  <div className="min-w-8 text-center text-lg font-semibold text-slate-700">{quantity}</div>
                  <button onClick={() => removeProduct(product._id)} className="sf-chip h-10 w-10 p-0">
                    {quantity === 1 ? "×" : "−"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <aside className="sf-panel h-fit border border-teal-100 shadow-xl shadow-slate-900/5 lg:sticky lg:top-24">
          <p className="sf-kicker">{t("cart")}</p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">{t("ent")}</h2>
          <p className="mt-3 rounded-[1rem] border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-900">
            {t("cartFastNote")}
          </p>
          <div className="mt-6 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
          <div className="sf-metric mt-0">
            <span className="font-semibold text-slate-700">{t("sous")}</span>
            <span className="font-bold text-teal-700">
              {total}
              {t("da")}
            </span>
          </div>
          </div>
          <button
            onClick={() => {
              void goToCheckout();
            }}
            className="sf-button-accent mt-6 w-full justify-center shadow-lg shadow-teal-900/20"
          >
            {t("ent")}
          </button>
        </aside>
      </section>
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur lg:hidden">
        <div className="sf-container flex items-center gap-3 px-0">
          <div className="min-w-0 flex-1 rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t("sous")}</div>
            <div className="truncate text-lg font-bold text-teal-700">
              {total}
              {t("da")}
            </div>
          </div>
          <button
            onClick={() => {
              void goToCheckout();
            }}
            className="sf-button-accent flex-1 justify-center"
          >
            {t("ent")}
          </button>
        </div>
      </div>
    </Layout>
  );
}

export default CartPage;
