"use client";
import { useEffect, useState, useContext } from "react";
import React from "react";
import { v4 as uuidv4 } from "uuid";
import {handleInitiateCheckout,handleViewProduct} from "@/app/components/Init";
import { useRouter, useSearchParams } from "next/navigation";


import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

import Carousel from "../../components/Carousel";

import Image from "next/image";
import Link from "next/link";

import { CartContext } from "../../components/cartContext";
import Layout from "@/app/components/layout";
import { useLocale, useTranslations } from "next-intl";
import Category from "@/app/components/Similar";

function waitForTracking(promise, timeoutMs = 250) {
  return Promise.race([
    promise.catch((error) => {
      console.error("InitiateCheckout error:", error);
    }),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

export default function Page({ id }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const [showMore, setShowMore] = useState(false);
  const [product, setProduct] = useState(null);
  const [category, setCategory] = useState(null);
  const [parent, setParent] = useState(null);
  const { addProduct } = useContext(CartContext);
  const [brand, setBrand] = useState(null);

  const t = useTranslations("common");

  async function goToCheckout(currentProduct) {
    await waitForTracking(handleInitiateCheckout({
      products: [currentProduct],
      totalValue: currentProduct.price,
    }));

    const nextSearchParams = new URLSearchParams(searchParams?.toString() ?? "");
    nextSearchParams.set("id", currentProduct._id);
    router.push(`/checkout?${nextSearchParams.toString()}`);
  }

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
        if (data.brand) {
          const response2 = await fetch(`/api/brando?id=${data.brand}`);
          const data2 = await response2.json();
          setBrand(data2);
        }
       handleViewProduct({ product: data });
      } catch (error) {
        console.error(error);
      }
    };

    fetchProduct();
  }, [id]);

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
      <div>
        <div className="lg:hidden">
          <Layout>
            <div className="aspect-square mt-8 mb-4 w-full flex justify-center items-center bg-gray-300 animate-pulse ">
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
            <div className="h-10 w-32 bg-gray-300 rounded-xl mb-4 ml-2"></div>
            <div className="h-4 bg-gray-300 rounded-full mx-3 mb-2"></div>
            <div className="h-4 bg-gray-300 rounded-full mx-3 mb-2"></div>
            <div className="h-4 bg-gray-300 rounded-full mx-3 mb-2"></div>
            <div className="h-8 bg-gray-300 rounded-full m-3 w-28  text-end text-gray-500 px-2 font-bold text-2xl">
              DA
            </div>
            <div className="h-3 bg-gray-300 rounded-full mx-3 mb-2"></div>
            <div className="h-3 bg-gray-300 rounded-full mx-3 mb-2"></div>
            <div className="h-3 bg-gray-300 rounded-full mx-3 mb-2"></div>
            <div className="h-3 bg-gray-300 rounded-full mx-3 mb-2"></div>
            <div className="h-3 bg-gray-300 rounded-full mx-3 mb-2"></div>
            <div className="h-3 bg-gray-300 rounded-full mx-3 mb-2"></div>
            <div className="h-3 bg-gray-300 rounded-full mx-3 mb-2"></div>
            <div className="h-3 bg-gray-300 rounded-full mx-3 mb-2"></div>
            <div className="h-3 bg-gray-300 rounded-full mx-3 mb-2"></div>
            <div className="h-3 bg-gray-300 rounded-full mx-3 mb-2"></div>
            <div className="h-3 bg-gray-300 rounded-full mx-3 mb-2"></div>
            <div className="h-3 bg-gray-300 rounded-full mx-3 mb-2"></div>
            <div className="h-3 bg-gray-300 rounded-full mx-3 mb-2"></div>
            <div className="h-3 bg-gray-300 rounded-full mx-3 mb-2"></div>
            <div className="h-3 bg-gray-300 rounded-full mx-3 mb-2"></div>
            <div className="h-3 bg-gray-300 rounded-full mx-3 mb-2"></div>

            <div className="  fixed bottom-0 w-full bg-white py-4 flex  justify-between ">
              <button className="bg-white  hover:bg-teal-700 mx-auto px-1 py-2  rounded-full border-solid border-black   btnn">
                Ajouter au panier
              </button>
              <button className="bg-black  hover:bg-teal-700 mx-auto text-white px-1  py-2 border-solid border-black  rounded-full text-md btnn">
                Acheter maintenant
              </button>
            </div>
          </Layout>
        </div>

        <Layout className="hidden lg:block">
          <div className="grid grid-cols-2 gap-3 p-4 ">
            <div className="  ">
              <div
                id="img cont"
                className="border-b-2 mt-4 border-solid border-gray-400 p-4 rounded-lg bg-gray-300 animate-pulse shadow "
              >
                <div className="aspect-square mt-8 mb-4 w-full flex justify-center items-center bg-gray-300  ">
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
              </div>
              <div id="price" className="mt-6">
                <span className="font-semibold text-3xl">Prix: </span>
                <span className="font-bold text-3xl text-emerald-700">DA</span>
              </div>
              <div className="flex flex-row mt-6 gap-6 justify-center">
                <button className=" px-24 py-4 text-xl bg-black text-white rounded-lg hover:bg-teal-700 transition-all duration-300">
                  Acheter maintenant
                </button>
                <button className="px-28 py-4 text-xl bg-white text-black ring-1 hover:bg-teal-700 transition-all duration-300 ring-black rounded-lg">
                  Ajouter au panier
                </button>
              </div>
            </div>
            <div>
              <div className="h-12 w-48 mt-8  rounded-lg ml-6 mb-6  flex justify-center items-center bg-gray-300 animate-pulse ">
                <svg
                  className="w-8 h-8 text-gray-200 dark:text-gray-600"
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="currentColor"
                  viewBox="0 0 20 18"
                >
                  <path d="M18 0H2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2Zm-5.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm4.376 10.481A1 1 0 0 1 16 15H4a1 1 0 0 1-.895-1.447l3.5-7A1 1 0 0 1 7.468 6a.965.965 0 0 1 .9.5l2.775 4.757 1.546-1.887a1 1 0 0 1 1.618.1l2.541 4a1 1 0 0 1 .028 1.011Z" />
                </svg>
              </div>
              <div id="text" className="ml-3">
                <div id="title">
                  <div className="h-6 bg-gray-300 rounded-full mx-3 mt-16"></div>
                  <div className="h-6 bg-gray-300 rounded-full w-2/3 mx-3 mt-2   "></div>

                  <div className="h-4 bg-gray-300 rounded-full mx-3 mb-0 mt-16"></div>
                  <div className="h-4 bg-gray-300 rounded-full  mx-3  mt-2 "></div>
                  <div className="h-4 bg-gray-300 rounded-full  mx-3  mt-2 "></div>
                  <div className="h-4 bg-gray-300 rounded-full  mx-3  mt-2 "></div>
                  <div className="h-4 bg-gray-300 rounded-full  mx-3  mt-2 "></div>
                  <div className="h-4 bg-gray-300 rounded-full  mx-3  mt-2 "></div>
                  <div className="h-4 bg-gray-300 rounded-full  mx-3  mt-2 "></div>
                  <div className="h-4 bg-gray-300 rounded-full  mx-3  mt-2 "></div>
                  <div className="h-4 bg-gray-300 rounded-full  mx-3  mt-2 "></div>
                  <div className="h-4 bg-gray-300 rounded-full  mx-3  mt-2 "></div>
                  <div className="h-4 bg-gray-300 rounded-full  mx-3  mt-2 "></div>
                  <div className="h-4 bg-gray-300 rounded-full  mx-3  mt-2 "></div>
                  <div className="h-4 bg-gray-300 rounded-full  mx-3  mt-2 "></div>
                  <div className="h-4 bg-gray-300 rounded-full  mx-3  mt-2 "></div>
                  <div className="h-4 bg-gray-300 rounded-full  mx-3  mt-2 "></div>
                  <div className="h-4 bg-gray-300 rounded-full  mx-3  mt-2 "></div>
                </div>
              </div>
            </div>
          </div>
        </Layout>
      </div>
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
                className=" mt-4 border-solid border-b-4 bg-white pb-6 border-slate-200 overflow-hidden "
              >
                <Carousel
                  data={
                    locale === "ar"
                      ? [...product.images].reverse()
                      : product.images
                  }
                />
              </div>
              <div id="brand" className="m-2">
                {brand && (
                  <Link href={"/products?brand=" + brand._id}>
                    <Image
                      src={brand.image}
                      alt={brand.name}
                      width={130}
                      height={130}
                    />
                  </Link>
                )}
              </div>
              {category && (
                <h2 className="ps-3 text-lg font-serif md:text-xl">
                  -{" "}
                  <Link
                    className="hover:text-teal-600 transition-colors duration-300"
                    href={"/products?category=" + category?.parent}
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
              )}
              <div id="text" className="ms-3">
                <div id="title">
                  <h3 className="text-xl font-medium">
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
                    <span className="font-bold text-red-500  text-2xl block">
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
                  <span className="font-bold text-2xl text-emerald-700">
                    {product.price}
                    {t("da")}
                  </span>
                </div>
                <p
                  className={` font-medium mb-1 text-sm ${
                    product.stock > 0
                      ? product.stock > 5
                        ? "text-teal-700"
                        : "text-yellow-600"
                      : "text-red-600"
                  }`}
                >
                  {" "}
                  {product.stock > 0
                    ? product.stock > 5
                      ? t("es")
                      : t("mq")
                    : t("ns")}
                </p>
                <div className="border-b-2 border-slate-200"></div>

                <div id="desc" className="mt-2">
                  <h1 className="font-bold text-lg mb-2">{t("desc")}:</h1>
                  <pre className=" text-wrap font-sans ">
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
            <div className="fixed bottom-0 w-full bg-white py-4 flex shadow border-slate-200 gap-2.5  pb-5 justify-between px-1 z-50">
              <button
                onClick={() => addProduct(product._id)}
                className="hover:bg-teal-500 hover:scale-105  bg-gray-700   transition-all duration-300  flex-grow text-center text-white mx-auto px-1.5 py-2  rounded-full    btnn"
              >
                {t("ajt")}
              </button>
<button
   onClick={(e) => {
    e.preventDefault();
    void goToCheckout(product);
  }}
  className="text-center bg-orange-500 hover:scale-105 transition-transform mx-auto text-white px-1.5 flex-grow py-2 border-solid rounded-full text-md btnn"
>
  {t("ach")}
</button>
            </div>
          ) : (
            <></>
          )}
          <div className="pb-16">
            <div>
              {category && (
                <Category
                  key={category._id}
                  categoryid={category._id}
                ></Category>
              )}
            </div>
          </div>
        </Layout>
      </div>

      <div className="hidden  lg:flex">
        <Layout>
          <div className="grid grid-cols-2 gap-3 p-4  ">
            <div>
              <div
                id="img cont"
                className="outline-none border-b-2 border-solid border-gray-400 p-6 rounded-lg bg-white shadow "
              >
                <Carousel
                  data={
                    locale === "ar"
                      ? [...product.images].reverse()
                      : product.images
                  }
                />
              </div>
             {product.stock > 0 && <div className="flex flex-row mt-8 gap-6 justify-center">
                <button
              onClick={(e) => {
    e.preventDefault();
    void goToCheckout(product);
  }}

                  className=" text-center 2xl:px-24 xl:px-20 lg:px-12 py-2 2xl:py-3 lg:text-lg xl:text-xl  bg-orange-500 hover:scale-105 text-white rounded-xl shadow-md  transition-all duration-300"
                >
                  {t("ach")}
                </button>
                <button
                  onClick={() => addProduct(product._id)}
                  className=" 2xl:px-26 xl:px-20 lg:px-14 py-1 2xl:py-2 lg:text-lg xl:text-xl hover:bg-teal-600 hover:scale-105  bg-gray-700 text-white  transition-all duration-300  rounded-xl shadow-md"
                >
                  {t("ajt")}
                </button>
              </div>}
            </div>
            <div>
              <div id="brand" className="m-2 ">
                {brand && (
                  <Link href={"/products?brand=" + brand._id}>
                    <Image
                      src={brand.image}
                      alt={brand.name}
                      width={220}
                      height={160}
                    />
                  </Link>
                )}
              </div>
              {category && (
                <h2 className="text-md ps-2  md:text-xl">
                  <Link
                    className="hover:text-teal-600 transition-colors duration-300"
                    href={"/products?category=" + category?.parent}
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
              )}

              <div id="text" className="ms-3">
                <h1 className="text-2xl font-medium mt-4">
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
                    <span className="font-bold text-red-500  text-2xl block">
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
                  <span className="font-semibold text-3xl">{t("prix")}: </span>
                  <span className="font-bold text-3xl text-emerald-700">
                    {product.price}
                    {t("da")}
                  </span>
                </div>

                <p
                  className={` font-medium mb-1 lg:text-base ${
                    product.stock > 0
                      ? product.stock > 5
                        ? "text-teal-700"
                        : "text-yellow-600"
                      : "text-red-600"
                  }`}
                >
                  {" "}
                  {product.stock > 0
                    ? product.stock > 5
                      ? t("es")
                      : t("mq")
                    : t("ns")}
                </p>

                <div id="desc" className="mt-12 text-base   ">
                  <h4 className="text-lg font-medium">{t("desc")}:</h4>
                  <pre
                    className={`text-wrap font-sans mt-2 transition-all duration-300 ${
                      showMore ? "max-h-screen" : "max-h-20 overflow-hidden"
                    }`}
                  >
                    {showMore ? description : truncatedDescription}
                  </pre>
                  {description.length > 71 && (
                    <button
                      onClick={() => setShowMore(!showMore)}
                      className={
                        "mt-2 text-teal-600 hover:text-teal-700  bg-opacity-50 backdrop-filter backdrop-blur-md  transition-all duration-300 "
                      }
                    >
                      {showMore ? t("vm") : t("vp")}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="col-span-2 overflow-hidden">
              {category && (
                <Category
                  key={category._id}
                  categoryid={category._id}
                ></Category>
              )}
            </div>
          </div>
        </Layout>
      </div>
    </div>
  );
}
