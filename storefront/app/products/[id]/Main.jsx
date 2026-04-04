"use client";
import { useEffect, useState, useContext } from "react";
import React from "react";
import { v4 as uuidv4 } from "uuid";
import {handleInitiateCheckout,handleViewProduct} from "@/app/components/Init";
import { Link, useRouter } from "@/i18n/navigation";


import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

import Carousel from "../../components/Carousel";

import Image from "next/image";

import { CartContext } from "../../components/cartContext";
import Layout from "@/app/components/layout";
import { useLocale, useTranslations } from "next-intl";
import Category from "@/app/components/Similar";
import {
  buildBrandFilterHref,
  buildCategoryFilterHref,
} from "@/lib/storefront-api";
import { ProductDetailSkeleton } from "@/app/components/ui";

export default function Page({ id, initialProduct = null }) {
  const router = useRouter();
  const locale = useLocale();
  const [showMore, setShowMore] = useState(false);
  const [product, setProduct] = useState(initialProduct);
  const { addProduct, cartProducts } = useContext(CartContext);
  const brand = product?.brandInfo ?? null;
  const category = product?.categoryInfo ?? null;
  const parent = product?.parentCategoryInfo ?? null;

  const t = useTranslations("common");

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

  const description = t("prodd", {
    des: product?.description,
    desar:
      product?.description_ar.length > 2
        ? product?.description_ar
        : product?.description,
  });
  const truncatedDescription = description?.substring(0, 200) + "...";


  if (!product) {
    return (
      <Layout>
        <ProductDetailSkeleton />
      </Layout>
    );
  }

  return (
    <div className="  ">
      <div className="lg:hidden">
        <Layout className="">
          <div className=" ">
            <div className="">
              <div
                id="img cont"
                className="sf-card sf-container overflow-hidden p-4"
              >
                <Carousel
                  data={
                    locale === "ar"
                      ? [...product.images].reverse()
                      : product.images
                  }
                />
              </div>
              <div id="brand" className="sf-container mt-4">
                {brand && (
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
                )}
              </div>
              {category && (
                <h2 className="sf-container text-sm text-slate-500 md:text-base">
                  -{" "}
                  <Link
                    className="hover:text-teal-600 transition-colors duration-300"
                    href={buildCategoryFilterHref({ category: parent })}
                  >
                    {parent &&
                      t("par", {
                        par: parent?.name,
                        parar:
                          parent?.name_ar.length > 2
                            ? parent?.name_ar
                            : parent?.name,
                      })}
                  </Link>
                  {parent && " / "}
                  <Link
                    className="hover:text-teal-600 transition-colors duration-300"
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
              )}
              <div id="text" className="sf-container mt-3">
                <div id="title">
                  <h3 className="text-2xl font-semibold tracking-tight text-slate-900">
                    {t("prodt", {
                      name: product.title,
                      namear:
                        product.title_ar.length > 2
                          ? product.title_ar
                          : product.title,
                    })}
                  </h3>
                </div>
                <div id="price" className="mt-2">
                  {product.OldPrice && (
                    <span className="block text-lg font-medium text-orange-600">
                      <span className="line-through">
                        {product.OldPrice} {t("da")}
                      </span>
                      {product.ShowPercentage == 0 && (
                        <span>
                          (-
                          {Math.round(
                            ((product.OldPrice - product.price) /
                              product.OldPrice) *
                              100
                          )}
                          %)
                        </span>
                      )}
                    </span>
                  )}
                  <span className="text-3xl font-bold text-teal-700">
                    {product.price}
                    {t("da")}
                  </span>
                </div>
                <p
                  className={`mb-2 text-sm font-medium ${
                    product.stock > 0
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {" "}
                  {product.inStock ? t("es") : t("ns")}
                </p>
                <div className="mt-3 h-px bg-slate-200"></div>

                <div id="desc" className="mt-2">
                  <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{t("desc")}</h2>
                  <pre className="text-wrap font-sans text-sm leading-7 text-slate-600">
                    {t("prodd", {
                      des: product.description,
                      desar:
                        product.description_ar.length > 2
                          ? product.description_ar
                          : product.description,
                    })}
                  </pre>
                </div>
              </div>
            </div>
          </div>
          {product.stock > 0 ? (
            <>
            {cartProducts.length > 0 ? (
              <div className="fixed bottom-24 right-4 z-50 md:hidden">
                <Link
                  href="/cart"
                  className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-900 shadow-xl shadow-slate-900/10 transition-all duration-200 hover:-translate-y-0.5 hover:text-teal-700"
                  aria-label={t("cart")}
                >
                  <span className="relative">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
                    </svg>
                    <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[11px] font-bold text-white">
                      {cartProducts.length}
                    </span>
                  </span>
                </Link>
              </div>
            ) : null}
            <div className="fixed bottom-3 left-3 right-3 z-50 flex gap-2.5 rounded-[1.5rem] border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur">
              <button
                onClick={() => addProduct(product._id, product)}
                className="sf-button-secondary flex-grow"
              >
                {t("ajt")}
              </button>
<button
   onClick={(e) => {
    e.preventDefault();

    // Fire the FB event asynchronously (do not await)
    handleInitiateCheckout({
      products: [product],
      totalValue: product.price,
    }).catch((err) => console.error("InitiateCheckout error:", err));

    // Immediately navigate to checkout
    router.push("/checkout?id=" + product.slug);
  }}
  className="sf-button-accent flex-grow"
>
  {t("ach")}
</button>
            </div>
            </>
          ) : (
            <></>
          )}
          <div className="pb-16">
            <div>
              {category && (
                <Category
                  key={category._id}
                  categoryid={category._id}
                  productId={product._id}
                ></Category>
              )}
            </div>
          </div>
        </Layout>
      </div>

      <div className="hidden lg:block">
        <Layout>
          <section className="sf-container py-6">
            <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] xl:gap-10">
            <div>
              <div
                id="img cont"
                className="sf-card p-6"
              >
                <Carousel
                  data={
                    locale === "ar"
                      ? [...product.images].reverse()
                      : product.images
                  }
                />
              </div>
             {product.stock > 0 && <div className="mt-8 flex flex-row justify-center gap-6">
                <button
              onClick={(e) => {
    e.preventDefault();

    // Fire the FB event asynchronously (do not await)
    handleInitiateCheckout({
      products: [product],
      totalValue: product.price,
    }).catch((err) => console.error("InitiateCheckout error:", err));

    // Immediately navigate to checkout
    router.push("/checkout?id=" + product.slug);
  }}

                  className="sf-button-accent 2xl:px-24 xl:px-20 lg:px-12 py-2 2xl:py-3 lg:text-lg xl:text-xl"
                >
                  {t("ach")}
                </button>
                <button
                  onClick={() => addProduct(product._id, product)}
                  className="sf-button 2xl:px-26 xl:px-20 lg:px-14 py-1 2xl:py-2 lg:text-lg xl:text-xl"
                >
                  {t("ajt")}
                </button>
              </div>}
            </div>
            <div>
              <div id="brand" className="mb-4">
                {brand && (
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
                )}
              </div>
              {category && (
                <h2 className="text-sm text-slate-500 md:text-base">
                  <Link
                    className="hover:text-teal-600 transition-colors duration-300"
                    href={buildCategoryFilterHref({ category: parent })}
                  >
                    {parent &&
                      t("par", {
                        par: parent?.name,
                        parar:
                          parent?.name_ar.length > 2
                            ? parent?.name_ar
                            : parent?.name,
                      })}
                  </Link>
                  {parent && " / "}
                  <Link
                    className="hover:text-teal-600 transition-colors duration-300"
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
              )}

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
                  {product.OldPrice && (
                    <span className="block text-xl font-medium text-orange-600">
                      <span className="line-through">
                        {product.OldPrice} {t("da")}
                      </span>
                      {product.ShowPercentage == 0 && (
                        <span>
                          (-
                          {Math.round(
                            ((product.OldPrice - product.price) /
                              product.OldPrice) *
                              100
                          )}
                          %)
                        </span>
                      )}
                    </span>
                  )}
                  <span className="text-2xl font-semibold text-slate-900">{t("prix")}: </span>
                  <span className="text-3xl font-bold text-teal-700">
                    {product.price}
                    {t("da")}
                  </span>
                </div>

                <p
                  className={`mb-1 text-sm font-medium lg:text-base ${
                    product.stock > 0
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {" "}
                  {product.inStock ? t("es") : t("ns")}
                </p>

                <div id="desc" className="mt-12 text-base">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{t("desc")}</h4>
                  <pre
                    className={`mt-3 text-wrap font-sans leading-7 text-slate-600 transition-all duration-300 ${
                      showMore ? "max-h-screen" : "max-h-20 overflow-hidden"
                    }`}
                  >
                    {showMore ? description : truncatedDescription}
                  </pre>
                  {description.length > 71 && (
                    <button
                      onClick={() => setShowMore(!showMore)}
                      className="mt-3 text-sm font-semibold text-teal-700 transition-all duration-300 hover:text-teal-600"
                    >
                      {showMore ? t("vm") : t("vp")}
                    </button>
                  )}
                </div>
              </div>
            </div>
            </div>

            {category && (
              <div className="mt-12 overflow-hidden">
                <Category
                  key={category._id}
                  categoryid={category._id}
                  productId={product._id}
                ></Category>
              </div>
            )}
          </section>
        </Layout>
      </div>
    </div>
  );
}
