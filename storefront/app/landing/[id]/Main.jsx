"use client";

import Layout from "@/app/components/layout";
import Image from "next/image";
import { handleViewProduct } from "@/app/components/Init";
import { useState, useEffect, useRef } from "react";
import Carousel from "@/app/components/Carousel";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import OrderForm from "@/app/components/OrderForm";
import Category from "@/app/components/Similar";
import {
  buildBrandFilterHref,
  buildCategoryFilterHref,
} from "@/lib/storefront-api";

function TrustStrip({ t }) {
  const items = [
    t("pdpTrustPhoneConfirm"),
    t("pdpTrustCod"),
    t("pdpTrust48HourDelivery"),
    t("pdpTrustDispatch"),
  ];

  return (
    <div className="mt-5 rounded-[1.35rem] border border-slate-200 bg-slate-50 p-4">
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

export default function Landing({ id, initialProduct = null }) {
  const locale = useLocale();
  const t = useTranslations("common");
  const [showMore, setShowMore] = useState(false);
  const [product, setProduct] = useState(initialProduct);
  const [isOrderSectionInView, setIsOrderSectionInView] = useState(false);
  const orderSectionRef = useRef(null);
  const brand = product?.brandInfo ?? null;
  const category = product?.categoryInfo ?? null;
  const parent = product?.parentCategoryInfo ?? null;

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
    const orderSection = orderSectionRef.current;
    if (!orderSection || typeof window === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsOrderSectionInView(entry.isIntersecting);
      },
      {
        root: null,
        threshold: 0.2,
      },
    );

    observer.observe(orderSection);

    return () => {
      observer.disconnect();
    };
  }, [product?._id]);

  if (!product) {
    return null;
  }

  const description = t("prodd", {
    des: product?.description,
    desar: product?.description_ar.length > 2 ? product?.description_ar : product?.description,
  });
  const truncatedDescription = description?.substring(0, 300) + "...";

  return (
    <Layout>
      <div className="sf-container space-y-8 py-6">
        <section className="overflow-hidden rounded-[2rem] border border-teal-100 bg-gradient-to-br from-teal-50 via-white to-emerald-50 shadow-[0_22px_70px_rgba(15,23,42,0.08)]">
          <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="border-b border-teal-100/80 p-5 md:p-6 lg:border-b-0 lg:border-r">
              <Carousel data={locale === "ar" ? [...product.images].reverse() : product.images} />
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
                {product.OldPrice ? (
                  <span className="text-lg font-medium text-orange-600">
                    <span className="line-through">
                      {product.OldPrice} {t("da")}
                    </span>
                  </span>
                ) : null}
                <span className="text-3xl font-bold text-teal-700">
                  {product.price}
                  {t("da")}
                </span>
              </div>

              <p className={`mt-3 text-sm font-medium ${product.stock > 0 ? "text-green-600" : "text-red-600"}`}>
                {product.inStock ? t("es") : t("ns")}
              </p>

              {product.stock > 0 ? (
                <div className="mt-6 rounded-[1.6rem] border border-teal-200 bg-white/90 p-5 shadow-lg shadow-teal-900/10">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Link href="#order" className="sf-button-accent justify-center shadow-lg shadow-teal-900/20">
                      {t("ach")}
                    </Link>
                    <Link href="#details" className="sf-button-secondary justify-center">
                      {t("desc")}
                    </Link>
                  </div>
                  <TrustStrip t={t} />
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

        {product.stock > 0 ? (
          <section id="order" ref={orderSectionRef} className="scroll-mt-28">
            <div className="mb-4 text-center">
              <p className="sf-kicker">{t("ach")}</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
                {t("ent")}
              </h2>
            </div>
            <OrderForm prod={id} cart={false} showMobileStickySubmit={isOrderSectionInView} />
          </section>
        ) : (
          <div className="text-center text-lg text-red-500">{t("ns")}</div>
        )}

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
              <Link href="#order" className="sf-button-accent justify-center">
                {t("ach")}
              </Link>
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
      {product.stock > 0 && !isOrderSectionInView ? (
        <div className="fixed bottom-3 left-3 right-3 z-50 md:hidden">
          <Link href="#order" className="sf-button-accent w-full justify-center shadow-2xl shadow-teal-900/20">
            {t("ach")}
          </Link>
        </div>
      ) : null}
    </Layout>
  );
}
