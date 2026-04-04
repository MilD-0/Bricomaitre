"use client";
import Layout from "../components/layout";
import { useContext, useEffect, useState } from "react";
import { CartContext } from "../components/cartContext";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { handleInitiateCheckout } from "../components/Init";
import { buildItemArray, trackAnalyticsEvent } from "@/lib/analytics";
import { Link } from "@/i18n/navigation";

function CartPage() {
  const t = useTranslations("common");
  const { cartProducts, addProduct, removeProduct, cartSummary, rememberProducts } = useContext(CartContext);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    const snapshotProducts = cartSummary.items
      .map((item) => item.product)
      .filter(Boolean);

    setProducts(snapshotProducts);

    if (cartProducts.length === 0) {
      setProducts([]);
      return;
    }

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
  }, [cartProducts, cartSummary.items, rememberProducts]);

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
      <section className="sf-container grid gap-6 py-6 lg:grid-cols-[1.1fr_0.9fr]">
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

        <aside className="sf-panel h-fit lg:sticky lg:top-28">
          <p className="sf-kicker">{t("cart")}</p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">{t("ent")}</h2>
          <div className="sf-metric mt-6">
            <span className="font-semibold text-slate-700">{t("sous")}</span>
            <span className="font-bold text-teal-700">
              {total}
              {t("da")}
            </span>
          </div>
          <Link href={"/checkout"} className="mt-6 block w-full">
            <button
              onClick={() =>
                handleInitiateCheckout({
                  products,
                  totalValue: total,
                })
              }
              className="sf-button w-full justify-center"
            >
              {t("ent")}
            </button>
          </Link>
        </aside>
      </section>
    </Layout>
  );
}

export default CartPage;
