"use client";
import { useEffect, useState, useContext, Suspense } from "react";
import React from "react";

import bg from "../alyer.svg";
import bg2 from "../layerpc.svg";

import Image from "next/image";
import Link from "next/link";

import { CartContext } from "./cartContext";
import { useLocale, useTranslations } from "next-intl";

export default function Card({ id }) {
  const locale = useLocale();
  const [product, setProduct] = useState(null);
  const { addProduct } = useContext(CartContext);
  const [category, setCategory] = useState(null);

  const [parent, setParent] = useState(null);

  const t = useTranslations("common");

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const response = await fetch(`/api/products?id=${id}`);
        const data = await response.json();
        setProduct(data);
        if (data.category) {
          const response1 = await fetch(`/api/category?id=${data.category}`);
          const data1 = await response1.json();
          setCategory(data1);
          if (data1?.parent) {
            const response3 = await fetch(`/api/category?id=${data1?.parent}`);
            const data3 = await response3.json();
            setParent(data3);
          }
        }
      } catch (error) {
        console.error(error);
      }
    };

    fetchProduct();
  }, [id]);

  return (
    <main
      style={{
        backgroundImage:
          window.innerWidth <= 768 ? `url(${bg.src})` : `url(${bg2.src})`,
      }}
      className={
        " rounded-lg bg-contain hover:scale-105 transform transition duration-500 bg-bottom bg-no-repeat  bg-white w-full mx-auto p-4 m-4 max-w-xs  md:grid md:grid-cols-2 md:max-w-3xl md:gap-4 md:p-5 md:shadow-xl shadow-lg"
      }
    >
      <Link href={"/landing/" + id}>
        {product ? (
          <Suspense
            fallback={
              <div className="justify-center aspect-square mt-8 mb-4 w-full flex  items-center bg-gray-300 animate-pulse ">
                <svg
                  className="w-10 h-10 text-gray-200 dark:text-gray-600"
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="currentColor"
                  viewBox="0 0 20 18"
                >
                  <path d="M18 0H2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2Zm-5.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm4.376 10.481A1 1 0 0 1 16 15H4a1 1 0 0 1-.895-1.447l3.5-7A1 1 0 0 1 7.468 6a.965.965 0 0 1 .9.5l2.775 4.757 1.546-1.887a1 1 0 0 1 1.618.1l2.541 4a1 1 0 0 1 .028 1.011Z" />
                </svg>
              </div>
            }
          >
            {/* @ts-expect-error Async Server Component */}

            <Image
              src={product.images[0]}
              alt="product-img"
              className="mx-auto md:max-h-80 md:w-auto justify-center transition-all transl duration-200"
              height={500}
              width={500}
            />
          </Suspense>
        ) : (
          <div className="aspect-square  mb-4 w-full flex justify-center items-center bg-gray-300 animate-pulse ">
            <svg
              className="w-10 h-10 text-gray-200 dark:text-gray-600"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              fill="currentColor"
              viewBox="0 0 20 18"
            >
              <path d="M18 0H2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2Zm-5.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm4.376 10.481A1 1 0 0 1 16 15H4a1 1 0 0 1-.895-1.447l3.5-7A1 1 0 0 1 7.468 6a.965.965 0 0 1 .9.5l2.775 4.757 1.546-1.887a1 1 0 0 1 1.618.1l2.541 4a1 1 0 0 1 .028 1.011Z" />
            </svg>
          </div>
        )}{" "}
      </Link>
      {product ? (
        <section>
          <Link href={"/landing/" + id}>
            <h1 className="font-semibold text-xl hover:text-teal-600 transition-colors duration-300  uppercase mt-2 md:text-3xl">
              {t("prodt", {
                name: product.title,
                namear:
                  product.title_ar.length > 2
                    ? product.title_ar
                    : product.title,
              })}
            </h1>
          </Link>
          <h2 className="text-md font-serif md:text-xl">
            <Link
              className="hover:text-teal-600 transition-colors duration-300"
              href={"/products?category=" + category?.parent}
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
              className="hover:text-teal-600 transition-colors duration-300"
              href={
                parent
                  ? "/products?category=" +
                    category.parent +
                    "&childCategory=" +
                    category?._id
                  : "/products?category=" + category?._id
              }
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
            <span className="text-2xl font-light my-2 text-red-500">
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

          <h3 className="text-3xl font-light my-3">
            {product?.price}
            {t("da")}
          </h3>
          <p className="font-light text-gray-500">
            {" "}
            {t("summ", {
              summ: product?.summary,
              summar:
                product?.summary_ar.length > 2
                  ? product?.summary_ar
                  : product?.summary,
            })}
          </p>
          <section className="flex items-center gap-4 my-4">
            <button
              onClick={() => addProduct(id)}
              className="hover:bg-teal-400 transition-colors duration-200    bg-teal-500  rounded-xl   text-white py-2 px-4  flex-grow md:flex-none"
            >
              {t("ajt")}
            </button>
            <Link
              href={"/landing/" + id}
              className=" hover:bg-teal-400 transition-colors duration-200    bg-teal-500  rounded-xl    text-white py-2 px-3   "
            >
              {t("vp")}
            </Link>
          </section>
          <h2 className="text-lg font-light my-1 uppercase">{t("carac")}</h2>
          <ul className="list-disc marker:text-teal-600 text-sm text-gray-600">
            {locale != "ar"
              ? product?.features.map((spec) => (
                  <li className="ml-3 pl-2 pb-1" key={spec.idx}>
                    {spec}
                  </li>
                ))
              : product?.features_ar.length > 2
              ? product?.features_ar.map((spec) => (
                  <li className="ml-3 pl-2 pb-1 " key={spec.idx}>
                    {spec}
                  </li>
                ))
              : product?.features.map((spec) => (
                  <li className="ml-3 pl-2 pb-1" key={spec.idx}>
                    {spec}
                  </li>
                ))}
          </ul>
        </section>
      ) : (
        <section>
          <div className="h-5 w-full bg-gray-300 rounded mb-2 "></div>
          <div className="h-5 w-full bg-gray-300 rounded mb-2 "></div>
          <div className="h-4 bg-gray-300 rounded md:h-6 mb-2"></div>
          <div className="h-12 bg-gray-300 rounded my-5 w-32  text-end text-gray-500 px-2 font-bold text-2xl"></div>
          <div className="h-3 bg-gray-300 rounded  mb-1"></div>
          <div className="h-3 bg-gray-300 rounded  mb-1"></div>
          <div className="h-3 bg-gray-300 rounded  mb-1 w-9/12"></div>
          <section className="flex items-center gap-4 my-4">
            <button className="bg-gradient-to-b   from-teal-400 to-teal-600  text-white py-2 px-4 rounded hover:bg-gradient-to-t flex-grow md:flex-none">
              {t("ajt")}
            </button>
            <Link
              href={"/landing/" + id}
              className="bg-gradient-to-b   from-teal-400 to-teal-600  text-white py-2 px-4 rounded hover:bg-gradient-to-t "
            >
              {t("vp")}
            </Link>
          </section>
          <h2 className="text-lg font-light my-1 uppercase">{t("carac")}</h2>
          <ul className="list-disc marker:text-teal-600 text-sm text-gray-600">
            <li className="ml-3 pl-2 pb-1" key="1">
              <div className="h-3 bg-gray-300 rounded  opacity-55 mb-1 w-9/12" />
            </li>
            <li className="ml-3 pl-2 pb-1" key="12">
              <div className="h-3 bg-gray-300 rounded  opacity-55 mb-1 w-9/12" />
            </li>
            <li className="ml-3 pl-2 pb-1" key="15">
              <div className="h-3 bg-gray-300 rounded  opacity-55 mb-1 w-9/12" />
            </li>
            <li className="ml-3 pl-2 pb-1" key="6">
              <div className="h-3 bg-gray-300 rounded  opacity-55 mb-1 w-9/12" />
            </li>
            <li className="ml-3 pl-2 pb-1" key="13">
              <div className="h-3 bg-gray-300 rounded  opacity-55 mb-1 w-9/12" />
            </li>
          </ul>
        </section>
      )}
    </main>
  );
}
