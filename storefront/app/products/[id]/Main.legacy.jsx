"use client";

import React, { useContext, useEffect, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

import { handleInitiateCheckout, handleViewProduct } from "@/app/components/Init";
import Category from "@/app/components/Similar";
import { ProductDetailSkeleton } from "@/app/components/ui";
import Layout from "@/app/components/layout";
import { CartContext } from "@/app/components/cartContext";
import Carousel from "@/app/components/Carousel";
import { getDisplayImages } from "@/lib/image-order";
import {
  getAnalyticsContextMetadata,
  trackAnalyticsEvent,
} from "@/lib/analytics";
import { isPaidTrafficSession } from "@/lib/paid-session";
import {
  buildBrandFilterHref,
  buildCategoryFilterHref,
} from "@/lib/storefront-api";
import { Link, useRouter } from "@/i18n/navigation";

function waitForTracking(promise, timeoutMs = 250) {
  return Promise.race([
    promise.catch((error) => {
      console.error("InitiateCheckout error:", error);
    }),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

function CartBadge({ count, label = "Panier" }) {
  return (
    <span className="relative inline-flex">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth="1.5"
        stroke="currentColor"
        className="size-5"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
        />
      </svg>
      <span className="sr-only">{label}</span>
      <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[11px] font-bold text-white">
        {count}
      </span>
    </span>
  );
}

function TrustStrip({ t }) {
  const items = [
    t("pdpTrustPhoneConfirm"),
    t("pdpTrustCod"),
    t("pdpTrust48HourDelivery"),
    t("pdpTrustDispatch"),
  ];

  return (
    <div className="mt-4 rounded-[1.35rem] border border-slate-200 bg-slate-50 p-4">
      <ul className="space-y-2 text-sm text-slate-700">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span className="mt-1 h-2 w-2 rounded-full bg-teal-600" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Page({ id, initialProduct = null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useTranslations("common");
  const [showMore, setShowMore] = useState(false);
  const [product, setProduct] = useState(initialProduct);
  const { addProduct, cartProducts } = useContext(CartContext);
  const paidSession = isPaidTrafficSession();

  const brand = product?.brandInfo ?? null;
  const category = product?.categoryInfo ?? null;
  const parent = product?.parentCategoryInfo ?? null;
  const cartItemCount = cartProducts.length;
  const hasCartItems = cartItemCount > 0;
  const displayImages = getDisplayImages(product?.images);

  async function goToCheckout(currentProduct) {
    const analyticsMetadata = getAnalyticsContextMetadata({
      paidSession,
      sourceSurface: "pdp",
    });

    void trackAnalyticsEvent({
      eventName: "buy_now_click",
      gaEventName: "buy_now_click",
      productId: currentProduct.id ?? null,
      productSlug: currentProduct.slug ?? null,
      value: currentProduct.price ?? 0,
      metadata: {
        ...analyticsMetadata,
        productId: currentProduct.id ?? null,
        productSlug: currentProduct.slug ?? null,
      },
    }).catch((error) => console.error(error));

    await waitForTracking(
      handleInitiateCheckout({
        products: [currentProduct],
        totalValue: currentProduct.price,
      }),
    );

    const nextSearchParams = new URLSearchParams(searchParams?.toString() ?? "");
    nextSearchParams.set("id", currentProduct.slug);
    router.push(`/checkout?${nextSearchParams.toString()}`);
  }

  useEffect(() => {
    if (initialProduct) {
      handleViewProduct({ product: initialProduct });
      return;
    }

    const fetchProduct = async () => {
      try {
        const response = await fetch(`/api/products?id=${id}`);
        const data = await response.json();
        setProduct(data);
        handleViewProduct({ product: data });
      } catch (error) {
        console.error(error);
      }
    };

    fetchProduct();
  }, [id, initialProduct]);

  if (!product) {
    return (
      <Layout>
        <ProductDetailSkeleton />
      </Layout>
    );
  }

  const description = t("prodd", {
    des: product?.description,
    desar:
      product?.description_ar.length > 2
        ? product?.description_ar
        : product?.description,
  });
  const truncatedDescription = `${description?.substring(0, 200)}...`;

  const ctaCardClassName =
    "mt-5 rounded-[1.6rem] border border-teal-200 bg-gradient-to-br from-teal-50 via-white to-emerald-50 p-5 shadow-lg shadow-teal-900/10";

  return (
    <div>
      <div className="lg:hidden">
        <Layout>
          <div className="pb-28">
            <div className="sf-card sf-container overflow-hidden p-4">
              <Carousel
                key={`${product._id}-${locale}`}
                data={displayImages}
              />
            </div>

            <div id="brand" className="sf-container mt-4">
              {brand ? (
                <Link href={buildBrandFilterHref(brand)}>
                  <Image
                    src={brand.image}
                    alt={brand.name}
                    width={130}
                    height={130}
                    className="rounded-[1rem] bg-white p-2 shadow-sm"
                    sizes="130px"
                  />
                </Link>
              ) : null}
            </div>

            {category ? (
              <h2 className="sf-container mt-3 text-sm text-slate-500 md:text-base">
                <Link
                  className="transition-colors duration-300 hover:text-teal-600"
                  href={buildCategoryFilterHref({ category: parent })}
                >
                  {parent
                    ? t("par", {
                        par: parent?.name,
                        parar:
                          parent?.name_ar.length > 2
                            ? parent?.name_ar
                            : parent?.name,
                      })
                    : ""}
                </Link>
                {parent ? " / " : ""}
                <Link
                  className="transition-colors duration-300 hover:text-teal-600"
                  href={buildCategoryFilterHref({
                    category: parent ?? category,
                    childCategory: parent ? category : undefined,
                  })}
                >
                  {t("catn", {
                    catn: category?.name,
                    catnar:
                      category?.name_ar?.length > 2
                        ? category?.name_ar
                        : category?.name,
                  })}
                </Link>
              </h2>
            ) : null}

            <div id="text" className="sf-container mt-3">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                {t("prodt", {
                  name: product.title,
                  namear:
                    product.title_ar.length > 2
                      ? product.title_ar
                      : product.title,
                })}
              </h1>

              <div id="price" className="mt-3">
                {product.OldPrice ? (
                  <span className="block text-lg font-medium text-orange-600">
                    <span className="line-through">
                      {product.OldPrice} {t("da")}
                    </span>
                    {product.ShowPercentage == 0 ? (
                      <span>
                        {" "}
                        (-
                        {Math.round(
                          ((product.OldPrice - product.price) / product.OldPrice) * 100,
                        )}
                        %)
                      </span>
                    ) : null}
                  </span>
                ) : null}
                <span className="text-3xl font-bold text-teal-700">
                  {product.price}
                  {t("da")}
                </span>
              </div>

              <p
                className={`mt-2 text-sm font-medium ${
                  product.stock > 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {product.inStock ? t("es") : t("ns")}
              </p>

              {product.stock > 0 ? (
                <div className={ctaCardClassName}>
                  <button
                    onClick={(event) => {
                      event.preventDefault();
                      void goToCheckout(product);
                    }}
                    className="sf-button-accent w-full justify-center shadow-lg shadow-teal-900/20"
                  >
                    {t("ach")}
                  </button>
                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <button
                      onClick={() => addProduct(product._id, product)}
                      className="sf-button-secondary justify-center"
                    >
                      {t("ajt")}
                    </button>
                    {hasCartItems ? (
                      <Link
                        href="/cart"
                        className="sf-chip inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-700"
                      >
                        <CartBadge count={cartItemCount} label={t("cart")} />
                        <span>{t("cart")}</span>
                      </Link>
                    ) : null}
                  </div>
                  <TrustStrip t={t} />
                </div>
              ) : null}

              <div className="mt-5 h-px bg-slate-200" />

              <div id="desc" className="mt-3">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {t("desc")}
                </h2>
                <pre className="text-wrap font-sans text-sm leading-7 text-slate-600">
                  {description}
                </pre>
              </div>
            </div>

            {category ? (
              <div className="mt-8">
                <Category
                  key={category._id}
                  categoryid={category._id}
                  productId={product._id}
                />
              </div>
            ) : null}
          </div>
        </Layout>

        {product.stock > 0 ? (
          <div className="fixed bottom-3 left-3 right-3 z-50 flex gap-2.5 rounded-[1.6rem] border border-slate-200 bg-white/95 p-3 shadow-2xl shadow-slate-900/15 backdrop-blur">
            <button
              onClick={(event) => {
                event.preventDefault();
                void goToCheckout(product);
              }}
              className="sf-button-accent flex-1 justify-center shadow-lg shadow-teal-900/20"
            >
              {t("ach")}
            </button>
            <button
              onClick={() => addProduct(product._id, product)}
              className="sf-button-secondary px-4"
            >
              {t("ajt")}
            </button>
            {hasCartItems ? (
              <Link
                href="/cart"
                className="inline-flex items-center justify-center rounded-[1.2rem] border border-slate-200 bg-white px-4 text-slate-900 shadow-sm"
                aria-label={t("cart")}
              >
                <CartBadge count={cartItemCount} label={t("cart")} />
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="hidden lg:block">
        <Layout>
          <section className="sf-container py-6">
            <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] xl:gap-10">
              <div>
                <div className="sf-card p-6">
                  <Carousel
                    key={`${product._id}-${locale}-desktop`}
                    data={displayImages}
                  />
                </div>
              </div>

              <div>
                <div id="brand" className="mb-4">
                  {brand ? (
                    <Link href={buildBrandFilterHref(brand)}>
                      <Image
                        src={brand.image}
                        alt={brand.name}
                        width={220}
                        height={160}
                        className="rounded-[1rem] bg-white p-2 shadow-sm"
                        sizes="220px"
                      />
                    </Link>
                  ) : null}
                </div>

                {category ? (
                  <h2 className="text-sm text-slate-500 md:text-base">
                    <Link
                      className="transition-colors duration-300 hover:text-teal-600"
                      href={buildCategoryFilterHref({ category: parent })}
                    >
                      {parent
                        ? t("par", {
                            par: parent?.name,
                            parar:
                              parent?.name_ar.length > 2
                                ? parent?.name_ar
                                : parent?.name,
                          })
                        : ""}
                    </Link>
                    {parent ? " / " : ""}
                    <Link
                      className="transition-colors duration-300 hover:text-teal-600"
                      href={buildCategoryFilterHref({
                        category: parent ?? category,
                        childCategory: parent ? category : undefined,
                      })}
                    >
                      {t("catn", {
                        catn: category?.name,
                        catnar:
                          category?.name_ar?.length > 2
                            ? category?.name_ar
                            : category?.name,
                      })}
                    </Link>
                  </h2>
                ) : null}

                <div id="text" className="pt-2">
                  <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900">
                    {t("prodt", {
                      name: product.title,
                      namear:
                        product.title_ar.length > 2
                          ? product.title_ar
                          : product.title,
                    })}
                  </h1>

                  <div id="price" className="mt-6">
                    {product.OldPrice ? (
                      <span className="block text-xl font-medium text-orange-600">
                        <span className="line-through">
                          {product.OldPrice} {t("da")}
                        </span>
                        {product.ShowPercentage == 0 ? (
                          <span>
                            {" "}
                            (-
                            {Math.round(
                              ((product.OldPrice - product.price) / product.OldPrice) * 100,
                            )}
                            %)
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                    <span className="text-2xl font-semibold text-slate-900">{t("prix")}: </span>
                    <span className="text-3xl font-bold text-teal-700">
                      {product.price}
                      {t("da")}
                    </span>
                  </div>

                  <p
                    className={`mt-2 text-sm font-medium lg:text-base ${
                      product.stock > 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {product.inStock ? t("es") : t("ns")}
                  </p>

                  {product.stock > 0 ? (
                    <div className={ctaCardClassName}>
                      {hasCartItems ? (
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <span className="text-sm text-slate-600">
                            {t("cartReadyHint")}
                          </span>
                          <Link
                            href="/cart"
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                          >
                            <CartBadge count={cartItemCount} label={t("cart")} />
                            <span>{t("cart")}</span>
                          </Link>
                        </div>
                      ) : null}

                      <div className="flex flex-row gap-3">
                        <button
                          onClick={(event) => {
                            event.preventDefault();
                            void goToCheckout(product);
                          }}
                          className="sf-button-accent flex-1 py-3 text-lg shadow-lg shadow-teal-900/20 xl:text-xl"
                        >
                          {t("ach")}
                        </button>
                        <button
                          onClick={() => addProduct(product._id, product)}
                          className="sf-button-secondary flex-1 py-3 text-lg xl:text-xl"
                        >
                          {t("ajt")}
                        </button>
                      </div>

                      <TrustStrip t={t} />
                    </div>
                  ) : null}

                  <div id="desc" className="mt-12 text-base">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {t("desc")}
                    </h4>
                    <pre
                      className={`mt-3 text-wrap font-sans leading-7 text-slate-600 transition-all duration-300 ${
                        showMore ? "max-h-screen" : "max-h-20 overflow-hidden"
                      }`}
                    >
                      {showMore ? description : truncatedDescription}
                    </pre>
                    {description.length > 71 ? (
                      <button
                        onClick={() => setShowMore(!showMore)}
                        className="mt-3 text-sm font-semibold text-teal-700 transition-all duration-300 hover:text-teal-600"
                      >
                        {showMore ? t("vm") : t("vp")}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {category ? (
              <div className="mt-12 overflow-hidden">
                <Category
                  key={category._id}
                  categoryid={category._id}
                  productId={product._id}
                />
              </div>
            ) : null}
          </section>
        </Layout>
      </div>
    </div>
  );
}
