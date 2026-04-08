"use client";
import Layout from "../components/layout";
import Card from "../components/Card";
import Brand from "../components/Brand";
import Category from "../components/Category";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { readVerifiedStorefrontOrder } from "@/lib/storefront-order-client";

function formatDeliveryType(value, c) {
  return value === 1 ? c("lv2") : c("lv1");
}

export default function ThankYou({ modified = false, orderId = null, token = null }) {
  const t = useTranslations("thx");
  const f = useTranslations("common");
  const c = useTranslations("checkout");

  const [featuredBrands, setFeaturedBrands] = useState(null);
  const [categories, setCategories] = useState(null);
  const [products, setProducts] = useState(null);
  const [order, setOrder] = useState(null);
  const [status, setStatus] = useState(orderId && token ? "loading" : "failure");

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await fetch("/api/featuredproducts?featured=true");
        const data = await response.json();
        setProducts(data);
        const response2 = await fetch("/api/categories?featured=true");
        const data2 = await response2.json();
        setCategories(data2);
        const response4 = await fetch("/api/brands?featured=true");
        const data4 = await response4.json();
        setFeaturedBrands(data4);
      } catch (error) {
        console.error(error);
      }
    };

    fetchProducts();
  }, []);

  useEffect(() => {
    if (!orderId || !token) {
      setStatus("failure");
      return;
    }

    let active = true;
    setStatus("loading");

    readVerifiedStorefrontOrder({ orderId, token })
      .then((item) => {
        if (!active) {
          return;
        }

        setOrder(item);
        setStatus("success");
      })
      .catch((error) => {
        console.error(error);
        if (!active) {
          return;
        }

        setOrder(null);
        setStatus("failure");
      });

    return () => {
      active = false;
    };
  }, [orderId, token]);

  return (
    <Layout>
      <div className="sf-container space-y-8 py-6">
        {status === "loading" ? (
          <section className="sf-panel text-center">
            <p className="sf-kicker">{t("verifying")}</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">{t("verifying")}</h1>
            <p className="mt-3 text-sm leading-7 text-slate-600">{t("verificationFailed")}</p>
          </section>
        ) : null}

        {status === "failure" ? (
          <section className="sf-panel text-center">
            <p className="sf-kicker">{t("confirmationUnavailable")}</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">{t("confirmationUnavailable")}</h1>
            <p className="mt-3 text-sm leading-7 text-slate-600">{t("verificationFailed")}</p>
            <div className="mt-6 flex flex-col gap-3 md:flex-row md:justify-center">
              <Link href={modified ? "/checkout?order=1" : "/checkout"} className="sf-button justify-center">
                {c("retryVerification")}
              </Link>
              <Link href="/products" className="sf-button-secondary justify-center">
                {t("vp")}
              </Link>
            </div>
          </section>
        ) : null}

        {status === "success" ? (
          <section className="sf-panel text-center">
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">{t("mrc")}</h1>
          </section>
        ) : null}

        {status === "success" && order?.orderProducts?.length ? (
          <section className="sf-panel">
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {order.orderProducts.map((product) => (
                <article key={`${product.rawValue}-${product.productId ?? "missing"}`} className="grid grid-cols-[96px_1fr] gap-4 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                  <div className="sf-image-frame aspect-square p-2">
                    {product.thumbnailUrl ? (
                      <Image
                        src={product.thumbnailUrl}
                        alt="product image"
                        width={140}
                        height={140}
                        className="h-full w-full object-contain"
                        sizes="96px"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <div className="line-clamp-2 text-sm font-semibold text-slate-900">
                      {f("prodt", { name: product.title, namear: product.title })}
                    </div>
                    <div className="mt-2 text-lg font-bold text-teal-700">
                      {product.unitPrice}
                      {f("da")}
                    </div>
                    <div className="mt-2 text-sm text-slate-600">
                      {c("quant")}: {product.quantity}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {status === "success" && order ? (
        <section className="sf-panel">
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <p><span className="font-semibold">{c("nom")}:</span> {order.fullName}</p>
            {order.state != null ? <p><span className="font-semibold">{c("wil")}:</span> {order.state}</p> : null}
            {order.city ? <p><span className="font-semibold">{c("comm")}:</span> {order.city}</p> : null}
            {order.homeAddress ? <p><span className="font-semibold">{c("addr")}:</span> {order.homeAddress}</p> : null}
            <p><span className="font-semibold">{c("tel")}:</span> {order.phoneNumber1}</p>
            {order.phoneNumber2 ? <p><span className="font-semibold">{c("tel2")}:</span> {order.phoneNumber2}</p> : null}
            <p><span className="font-semibold">{c("livr")}:</span> {formatDeliveryType(order.delivery, c)}</p>
            <p><span className="font-semibold">{c("liv")}:</span> <span className="font-semibold text-teal-700">{order.deliveryFee}{c("da")}</span></p>
            <p><span className="font-semibold">{c("sous")}:</span> <span className="font-semibold text-teal-700">{order.productSubtotal}{c("da")}</span></p>
            <p><span className="font-semibold">{c("tot")}:</span> <span className="font-semibold text-teal-700">{order.totalAmount}{c("da")}</span></p>
          </div>
        </section>
        ) : null}

        {status === "success" ? (
        <div className="flex flex-col gap-3 md:flex-row">
          <Link href="/checkout?order=1" className="sf-button w-full justify-center md:w-auto">
            {c("modi")}
          </Link>
          <Link href="/products" className="sf-button-secondary w-full justify-center md:w-auto">
            {t("vp")}
          </Link>
        </div>
        ) : null}

        <section>
          <div className="sf-container px-0 text-center">
            <h2 className="sf-title text-3xl">{t("va")}:</h2>
          </div>
          {products ? (
            <div className="mt-6 flex flex-wrap gap-4">
              {products.map((product) => (
                <Card key={product._id} id={product._id} />
              ))}
            </div>
          ) : null}
        </section>
      </div>

      {featuredBrands && featuredBrands.map((featuredBrand) => (
        <Brand key={featuredBrand._id} brandid={featuredBrand._id} />
      ))}
      {categories && categories.map((category) => (
        <Category key={category._id} categoryid={category._id} />
      ))}
    </Layout>
  );
}
