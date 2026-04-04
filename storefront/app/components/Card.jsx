"use client";
import { useEffect, useState, useContext, Suspense } from "react";
import React from "react";

import bg from "../alyer.svg";
import bg2 from "../layerpc.svg";

import Image from "next/image";

import { CartContext } from "./cartContext";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  buildCategoryFilterHref,
  buildLandingProductHref,
} from "@/lib/storefront-api";
import { toAnalyticsItem, trackAnalyticsEvent } from "@/lib/analytics";
import { ProductCardSkeleton } from "./ui";

export default function Card({ id, productData = null }) {
  const locale = useLocale();
  const [product, setProduct] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const { addProduct } = useContext(CartContext);

  const t = useTranslations("common");
  const productHref = product ? buildLandingProductHref(product) : "/products";
  const category = product?.categoryInfo ?? null;
  const parent = product?.parentCategoryInfo ?? null;
  const trackSelectItem = () => {
    if (!product) {
      return;
    }

    const analyticsItem = toAnalyticsItem(product);
    void trackAnalyticsEvent({
      eventName: "select_item",
      gaEventName: "select_item",
      productId: analyticsItem.productId ?? null,
      productSlug: analyticsItem.productSlug ?? null,
      categoryId: analyticsItem.categoryId ?? null,
      categorySlug: analyticsItem.categorySlug ?? null,
      brandId: analyticsItem.brandId ?? null,
      brandSlug: analyticsItem.brandSlug ?? null,
      value: analyticsItem.price ?? null,
      metadata: {
        items: [analyticsItem],
        listName: "featured_cards",
      },
      gaParams: {
        item_list_name: "featured_cards",
        items: [analyticsItem],
      },
    });
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 768px)");
    const syncViewport = () => setIsMobile(mediaQuery.matches);

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);

    return () => {
      mediaQuery.removeEventListener("change", syncViewport);
    };
  }, []);

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        if (productData) {
          setProduct(productData);
          return;
        }

        const response = await fetch(`/api/products?id=${id}`);
        const data = await response.json();
        setProduct(data);
      } catch (error) {
        console.error(error);
      }
    };

    fetchProduct();
  }, [id, productData]);

  return (
    <main
      style={{
        backgroundImage: `url(${isMobile ? bg.src : bg2.src})`,
      }}
      className="group sf-card mx-auto w-full max-w-[28rem] overflow-hidden bg-bottom bg-no-repeat p-4 transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_70px_rgba(15,23,42,0.14)] md:grid md:max-w-none md:grid-cols-[15rem_minmax(0,1fr)] md:items-start md:gap-5 md:p-5"
    >
      <Link href={productHref} onClick={trackSelectItem}>
        {product ? (
          <Suspense
            fallback={<ProductCardSkeleton />}
          >
            <div className="sf-image-frame aspect-square p-4 md:h-[15rem] md:aspect-auto md:p-3">
              <Image
                src={product.images[0]}
                alt="product-img"
                className="mx-auto h-full w-full justify-center object-contain transition-transform duration-300 group-hover:scale-105 md:max-h-[13rem]"
                height={500}
                width={500}
                sizes="(max-width: 768px) 100vw, 15rem"
              />
            </div>
          </Suspense>
        ) : (
          <ProductCardSkeleton />
        )}{" "}
      </Link>
      {product ? (
        <section className="mt-4 md:mt-0">
          <Link href={productHref} onClick={trackSelectItem}>
            <h1 className="mt-2 text-xl font-semibold uppercase tracking-tight text-slate-900 transition-colors duration-300 hover:text-teal-700 md:text-3xl">
              {t("prodt", {
                name: product.title,
                namear:
                  product.title_ar.length > 2
                    ? product.title_ar
                    : product.title,
              })}
            </h1>
          </Link>
          <h2 className="mt-1 text-sm text-slate-500 md:text-base">
            <Link
              className="transition-colors duration-300 hover:text-teal-700"
              href={buildCategoryFilterHref({ category: parent })}
            >
              {parent &&
                t("par", {
                  par: parent?.name,
                  parar:
                    parent?.name_ar.length > 2 ? parent?.name_ar : parent?.name,
                })}
            </Link>
            {parent && " / "}
            <Link
              className="transition-colors duration-300 hover:text-teal-700"
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
          {product.OldPrice && (
            <span className="my-3 block text-lg font-medium text-orange-600 md:text-xl">
              <span className="line-through">
                {product.OldPrice} {t("da")}
              </span>
              {product.ShowPercentage == 0 && (
                <span>
                  (-
                  {Math.round(
                    ((product.OldPrice - product.price) / product.OldPrice) *
                      100
                  )}
                  %)
                </span>
              )}
            </span>
          )}

          <h3 className="my-3 text-3xl font-semibold text-teal-700">
            {product?.price}
            {t("da")}
          </h3>
          <p className="text-sm leading-7 text-slate-600">
            {" "}
            {t("summ", {
              summ: product?.summary,
              summar:
                product?.summary_ar.length > 2
                  ? product?.summary_ar
                  : product?.summary,
            })}
          </p>
          <section className="my-5 flex items-center gap-3">
            <button
              onClick={() => addProduct(id, product)}
              className="sf-button flex-grow md:flex-none"
            >
              {t("ajt")}
            </button>
            <Link
              href={productHref}
              onClick={trackSelectItem}
              className="sf-button-secondary"
            >
              {t("vp")}
            </Link>
          </section>
          <h2 className="my-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{t("carac")}</h2>
          <ul className="list-disc text-sm text-slate-600 marker:text-teal-600">
            {locale != "ar"
              ? product?.features.map((spec, index) => (
                  <li className="ml-3 pl-2 pb-1" key={`${product._id ?? id}-feature-${index}`}>
                    {spec}
                  </li>
                ))
              : product?.features_ar.length > 2
              ? product?.features_ar.map((spec, index) => (
                  <li className="ml-3 pl-2 pb-1 " key={`${product._id ?? id}-feature-ar-${index}`}>
                    {spec}
                  </li>
                ))
              : product?.features.map((spec, index) => (
                  <li className="ml-3 pl-2 pb-1" key={`${product._id ?? id}-feature-fallback-${index}`}>
                    {spec}
                  </li>
                ))}
          </ul>
        </section>
      ) : (
        <section className="hidden" />
      )}
    </main>
  );
}
