"use client";

import { useContext, useEffect, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

import { handleInitiateCheckout, handleViewProduct } from "@/app/components/Init";
import Carousel from "@/app/components/Carousel";
import { CartContext } from "@/app/components/cartContext";
import Category from "@/app/components/Similar";
import Layout from "@/app/components/layout";
import { ProductDetailSkeleton } from "@/app/components/ui";
import {
  buildBrandFilterHref,
  buildCategoryFilterHref,
} from "@/lib/storefront-api";
import { getDisplayImages } from "@/lib/image-order";
import { withTrackingPrice } from "@/lib/cart-state";
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

export default function Page({
  id,
  initialProduct = null,
  promoCode = null,
  initialPromo = null,
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useTranslations("common");
  const [showMore, setShowMore] = useState(false);
  const [product, setProduct] = useState(initialProduct);
  const [promo, setPromo] = useState(initialPromo);
  const { addProduct, cartProducts } = useContext(CartContext);

  const brand = product?.brandInfo ?? null;
  const category = product?.categoryInfo ?? null;
  const parent = product?.parentCategoryInfo ?? null;
  const cartItemCount = cartProducts.length;
  const hasCartItems = cartItemCount > 0;
  const displayImages = getDisplayImages(product?.images);
  const effectivePrice = promo?.promoPrice ?? product?.price;
  const compareAtPrice = promo ? promo.originalPrice : product?.OldPrice;
  const promoQuery = promoCode ? `?promo=${encodeURIComponent(promoCode)}` : "";

  async function goToCheckout(currentProduct) {
    await waitForTracking(handleInitiateCheckout({
      products: [withTrackingPrice(currentProduct, effectivePrice)],
      totalValue: effectivePrice,
    }));

    const nextSearchParams = new URLSearchParams(searchParams?.toString() ?? "");
    nextSearchParams.set("id", currentProduct.slug);
    if (promo?.code ?? promoCode) {
      nextSearchParams.set("promo", promo?.code ?? promoCode);
    }
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

  useEffect(() => {
    if (!product?.id || !promoCode) {
      setPromo(null);
      return;
    }
    if (initialPromo?.code === promoCode) {
      setPromo(initialPromo);
      return;
    }

    let cancelled = false;
    const validatePromo = async () => {
      try {
        const response = await fetch(`/api/storefront/products/${product.id}/promo?code=${encodeURIComponent(promoCode)}`);
        if (!response.ok) {
          throw new Error("Failed to validate promo");
        }
        const data = await response.json();
        if (!cancelled) {
          setPromo(data?.ok ? data.promo : null);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setPromo(null);
        }
      }
    };

    validatePromo();

    return () => {
      cancelled = true;
    };
  }, [initialPromo, product?.id, promoCode]);

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
  const truncatedDescription = `${description?.substring(0, 300)}...`;

  return (
    <Layout>
      <div className="sf-container space-y-8 py-6">
        <section className="overflow-hidden rounded-[2rem] border border-teal-100 bg-gradient-to-br from-teal-50 via-white to-emerald-50 shadow-[0_22px_70px_rgba(15,23,42,0.08)]">
          <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="border-b border-teal-100/80 p-5 md:p-6 lg:border-b-0 lg:border-r">
              <Carousel key={`${product._id}-${locale}`} data={displayImages} />
            </div>

            <div className="p-5 md:p-6">
              <p className="sf-kicker">Bricomaitre</p>

              {brand ? (
                <Link href={buildBrandFilterHref(brand)} className="mt-4 inline-flex">
                  <Image
                    src={brand.image}
                    alt={brand.name}
                    width={180}
                    height={120}
                    className="rounded-[1rem] border border-slate-200 bg-white p-2 shadow-sm"
                    sizes="180px"
                  />
                </Link>
              ) : null}

              {category ? (
                <h2 className="mt-4 text-sm text-slate-500 md:text-base">
                  <Link className="hover:text-teal-700" href={buildCategoryFilterHref({ category: parent })}>
                    {parent &&
                      t("par", {
                        par: parent?.name,
                        parar: parent?.name_ar.length > 2 ? parent?.name_ar : parent?.name,
                      })}
                  </Link>
                  {parent && " / "}
                  <Link
                    className="hover:text-teal-700"
                    href={buildCategoryFilterHref({
                      category: parent ?? category,
                      childCategory: parent ? category : undefined,
                    })}
                  >
                    {t("catn", {
                      catn: category?.name,
                      catnar: category?.name_ar?.length > 2 ? category?.name_ar : category?.name,
                    })}
                  </Link>
                </h2>
              ) : null}

              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900">
                {t("prodt", {
                  name: product.title,
                  namear: product.title_ar.length > 2 ? product.title_ar : product.title,
                })}
              </h1>

              {product.summary2 ? (
                <p className="mt-4 text-base leading-7 text-slate-600">
                  {t("summ2", {
                    summ2: product?.summary2,
                    summ2ar: product?.summary2_ar.length > 2 ? product?.summary2_ar : product?.summary2,
                  })}
                </p>
              ) : null}

              <div className="mt-6 flex flex-wrap items-end gap-x-4 gap-y-2">
                {compareAtPrice ? (
                  <span className="text-lg font-medium text-orange-600">
                    <span className="line-through">
                      {compareAtPrice} {t("da")}
                    </span>
                  </span>
                ) : null}
                <span className="text-3xl font-bold text-teal-700">
                  {effectivePrice}
                  {t("da")}
                </span>
              </div>
              {promo ? (
                <p className="mt-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                  Promo {promo.code} applied
                </p>
              ) : null}

              <p
                className={`mt-2 text-sm font-medium ${
                  product.stock > 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {product.inStock ? t("es") : t("ns")}
              </p>

              {product.stock > 0 ? (
                <div className="mt-6 rounded-[1.6rem] border border-teal-200 bg-white/90 p-5 shadow-lg shadow-teal-900/10">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => void goToCheckout(product)}
                      className="sf-button-accent justify-center shadow-lg shadow-teal-900/20"
                    >
                      {t("ach")}
                    </button>
                    <button
                      type="button"
                      onClick={() => addProduct(product._id, product, { trackingPrice: effectivePrice })}
                      className="sf-button-secondary justify-center"
                    >
                      {t("ajt")}
                    </button>
                    <Link href="#details" className="sf-button-secondary justify-center">
                      {t("desc")}
                    </Link>
                  </div>
                  {hasCartItems ? (
                    <Link
                      href={`/cart${promoQuery}`}
                      className="mt-3 sf-chip inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-700"
                    >
                      <CartBadge count={cartItemCount} label={t("cart")} />
                      <span>{t("cart")}</span>
                    </Link>
                  ) : null}
                  <div className="mt-3">
                    <TrustStrip t={t} />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section id="details" className="sf-card p-5 md:p-6">
          <h2 className="sf-kicker">{t("desc")}</h2>
          <pre className={`mt-4 whitespace-pre-wrap font-sans text-base leading-7 text-slate-600 ${showMore ? "" : "max-h-32 overflow-hidden"}`}>
            {showMore ? description : truncatedDescription}
          </pre>
          {description.length > 71 ? (
            <button onClick={() => setShowMore(!showMore)} className="mt-4 text-sm font-semibold text-teal-700 hover:text-teal-600">
              {showMore ? t("vm") : t("vp")}
            </button>
          ) : null}
        </section>

        {product.stock <= 0 ? (
          <div className="text-center text-lg text-red-500">{t("ns")}</div>
        ) : null}

        {product.vidlink ? (
          <section className="sf-card p-5 md:p-6">
            <h2 className="text-2xl font-semibold text-slate-900">{t("vid")}</h2>
            <div className="mt-4 flex justify-center">
              <iframe
                src={"https://www.facebook.com/plugins/video.php?href=" + product.vidlink + "&show_text=true&t=0"}
                className="h-[80vh] w-full max-w-4xl overflow-hidden rounded-[1.5rem] border-0"
                scrolling="no"
                frameBorder="0"
                allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                allowFullScreen
              ></iframe>
            </div>
            <div className="mt-6">
              <button
                type="button"
                onClick={() => void goToCheckout(product)}
                className="sf-button-accent justify-center"
              >
                {t("ach")}
              </button>
            </div>
          </section>
        ) : null}

        <section className="sf-card p-5 md:p-6">
          <h2 className="text-2xl font-semibold text-slate-900">{t("imgs")}</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {product.images.map((image) => (
              <div key={image} className="sf-image-frame aspect-square p-4">
                <Image
                  alt="image"
                  className="h-full w-full object-contain"
                  height={500}
                  width={500}
                  src={image}
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
              </div>
            ))}
          </div>
        </section>

        {category ? <Category key={category._id} categoryid={category._id} productId={product._id} /> : null}
      </div>
      {product.stock > 0 ? (
        <div className="fixed bottom-3 left-3 right-3 z-50 md:hidden">
          <div className="flex gap-2 rounded-[1.6rem] border border-slate-200 bg-white/95 p-3 shadow-2xl shadow-slate-900/15 backdrop-blur">
            <button
              type="button"
              onClick={() => void goToCheckout(product)}
              className="sf-button-accent flex-1 justify-center shadow-2xl shadow-teal-900/20"
            >
              {t("ach")}
            </button>
            <button
              type="button"
              onClick={() => addProduct(product._id, product, { trackingPrice: effectivePrice })}
              className="sf-button-secondary px-4"
            >
              {t("ajt")}
            </button>
            {hasCartItems ? (
              <Link
                href={`/cart${promoQuery}`}
                className="inline-flex items-center justify-center rounded-[1.2rem] border border-slate-200 bg-white px-4 text-slate-900 shadow-sm"
                aria-label={t("cart")}
              >
                <CartBadge count={cartItemCount} label={t("cart")} />
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </Layout>
  );
}
