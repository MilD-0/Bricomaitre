"use client";

import Layout from "@/app/components/layout";
import Image from "next/image";
import { handleViewProduct } from "@/app/components/Init";
import { useState, useEffect, useContext } from "react";
import Carousel from "@/app/components/Carousel";
import { CartContext } from "@/app/components/cartContext";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import OrderForm from "@/app/components/OrderForm";
import Category from "@/app/components/Similar";
import {
  buildBrandFilterHref,
  buildCategoryFilterHref,
} from "@/lib/storefront-api";

export default function Landing({ id, initialProduct = null }) {
  const locale = useLocale();
  const t = useTranslations("common");
  const [showMore, setShowMore] = useState(false);
  const [product, setProduct] = useState(initialProduct);
  const { addProduct } = useContext(CartContext);
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
        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="sf-panel overflow-hidden">
            <Carousel data={locale === "ar" ? [...product.images].reverse() : product.images} />
          </div>

          <div className="sf-panel">
            {brand ? (
              <Link href={buildBrandFilterHref(brand)}>
                <Image
                  src={brand.image}
                  alt={brand.name}
                  width={180}
                  height={120}
                  className="rounded-[1rem] bg-white p-2 shadow-sm"
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

            <div className="mt-6">
              {product.OldPrice ? (
                <span className="block text-lg font-medium text-orange-600">
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
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="#order" className="sf-button-accent justify-center">{t("ach")}</Link>
                <button onClick={() => addProduct(product._id, product)} className="sf-button justify-center">{t("ajt")}</button>
              </div>
            ) : null}
          </div>
        </section>

        <section className="sf-panel">
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
          <section id="order" className="sf-panel">
            <OrderForm prod={id} cart={false} />
          </section>
        ) : (
          <div className="text-center text-lg text-red-500">{t("ns")}</div>
        )}

        {product.vidlink ? (
          <section className="sf-panel">
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
          </section>
        ) : null}

        <section className="sf-panel">
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
    </Layout>
  );
}
