"use client";

import Layout from "@/app/components/layout";

import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import Image from "next/image";
import Link from "next/link";

import { useState, useEffect, useContext } from "react";
import Carousel from "@/app/components/Carousel";
import { CartContext } from "@/app/components/cartContext";
import { useLocale, useTranslations } from "next-intl";
import OrderForm from "@/app/components/OrderForm";
import Category from "@/app/components/Category";
import Brand from "@/app/components/Brand";

export default function Landing({ id }) {
  const locale = useLocale();
  const t = useTranslations("common");

  const [showMore, setShowMore] = useState(false);
  const [product, setProduct] = useState(null);
  const { addProduct } = useContext(CartContext);
  const [brand, setBrand] = useState(null);

  const [category, setCategory] = useState(null);
  const [parent, setParent] = useState(null);

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
  const truncatedDescription = description?.substring(0, 300) + "...";

  var settings = {
    infinite: true,
    speed: 500,
    slidesToShow: 7,
    swipeToSlide: true,
    arrows: false,
  };

  if (!product) return null;

  return (
    <div>
      <div className="lg:hidden">
        <Layout>
          <div className="grid grid-cols-4 mt-2">
            <div className=" col-span-4">
              {" "}
              <div className="bg-white w-screen">
                {" "}
                <Image
                  priority={true}
                  src={product.images[0]}
                  className="slide-in  justify-center mx-auto  -z-10"
                  alt="product-img"
                  height="600"
                  width="600"
                ></Image>
              </div>
              <div class="info ps-2 mt-2 border-t-2 border-gray-200">
                <h2
                  style={{ color: product.color }}
                  className="font-bold text-2xl mt-2 tracking-wide"
                >
                  {t("prodt", {
                    name: product.title,
                    namear:
                      product.title_ar.length > 2
                        ? product.title_ar
                        : product.title,
                  })}
                  <br></br>
                </h2>
                {category && (
                  <h2 className=" text-lg  md:text-xl">
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
                {brand && (
                  <Link href={`/products?brand=${brand?._id}`}>
                    <Image
                      priority={true}
                      src={brand?.image}
                      className="slide-in   py-2"
                      alt="logo"
                      height="150"
                      width="150"
                    ></Image>
                  </Link>
                )}
                {product.summary2 && (
                  <p className="font-bold text-sm mr-1  top-[17.2rem] right-12 text-gray-500 text-pretty z-10">
                    {t("summ2", {
                      summ2: product?.summary2,
                      summ2ar:
                        product?.summary2_ar.length > 2
                          ? product?.summary2_ar
                          : product?.summary2,
                    })}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className=" w-full   flex flex-col justify-between  mt-10">
            <Link
              href="#order1"
              className="bg-orange-500  hover:bg-teal-700 mx-auto text-white px-6  py-3 border-solid  font-semibold rounded-full text-lg btnn animate-pulse duration-300"
            >
              {t("ach")}
            </Link>

            <h1 className="mt-1 text-center font-bold text-emerald-700 text-3xl">
              {product.price}
              {t("da")}
            </h1>
          </div>

          {product.specValues[1] && !product.specValues[2] && (
            <div className="flex p-4  justify-center mt-10 ">
              <div className="flex flex-row gap-4">
                <div class="m-auto  box-md rounded-2xl p-5 shadow-xl bg-gray-100 py-10 text-black ">
                  <div className="text-center jutify-center text-3xl text-teal-600">
                    {product.specIcons[0]}
                  </div>

                  <h2 className="text-center text-2xl text-teal-600 my-3">
                    {" "}
                    {product.specValues[0]}
                  </h2>
                  <p className="pt-1 text-center">
                    {locale == "ar" && product.specDescs_ar[0].length > 2
                      ? product.specDescs_ar[0]
                      : product.specDescs[0]}
                  </p>
                </div>

                <div class="m-auto  box-md rounded-2xl p-5 shadow-xl bg-gray-100 py-10 text-black ">
                  <div className="text-center jutify-center text-3xl text-teal-600">
                    {product.specIcons[1]}
                  </div>

                  <h2 className="text-center text-2xl text-teal-600 my-3">
                    {" "}
                    {product.specValues[1]}
                  </h2>
                  <p className="pt-1 text-center">
                    {locale == "ar" && product.specDescs_ar[1].length > 2
                      ? product.specDescs_ar[1]
                      : product.specDescs[1]}
                  </p>
                </div>
              </div>
            </div>
          )}
          {product.specValues[2] && (
            <div className="flex p-4 justify-center mt-10 ">
              <div className="flex   flex-row gap-4">
                <div class="m-auto  box-md rounded-2xl p-5 shadow-xl bg-gray-100 py-10 text-black ">
                  <div className="text-center jutify-center text-3xl text-teal-600">
                    {product.specIcons[0]}
                  </div>

                  <h2 className="text-center text-2xl text-teal-600 my-3">
                    {" "}
                    {product.specValues[0]}
                  </h2>
                  <p className="pt-1 text-center">
                    {locale == "ar" && product.specDescs_ar[0].length > 2
                      ? product.specDescs_ar[0]
                      : product.specDescs[0]}
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <div class="box-sm ring-black rounded-xl p-2 shadow-xl bg-gray-100 py-4 text-black ">
                    {" "}
                    <div className="text-center jutify-center text-2xl text-teal-600">
                      {product.specIcons[1]}
                    </div>
                    <h2 className="text-center  text-teal-600">
                      {product.specValues[1]}
                    </h2>
                    <p className="pt-1 text-sm text-center">
                      {locale == "ar" && product.specDescs_ar[1].length > 2
                        ? product.specDescs_ar[1]
                        : product.specDescs[1]}
                    </p>
                  </div>

                  <div class="box-sm ring-black rounded-xl p-2 shadow-xl bg-gray-100 py-4 text-black ">
                    {" "}
                    <div className="text-center jutify-center text-2xl text-teal-600">
                      {product.specIcons[2]}
                    </div>
                    <h2 className="text-center  text-teal-600">
                      {product.specValues[2]}
                    </h2>
                    <p className="pt-1 text-sm text-center">
                      {locale == "ar" && product.specDescs_ar[2].length > 2
                        ? product.specDescs_ar[2]
                        : product.specDescs[2]}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {description && (
            <div className="px-4 py-4 mt-10 bg-gradient-to-r from-gray-200 to-gray-100 rounded-lg m-2">
              <pre className="font-sans text-wrap">
                {t("prodd", {
                  des: product?.description,
                  desar:
                    product?.description_ar.length > 2
                      ? product?.description_ar
                      : product?.description,
                })}
              </pre>
            </div>
          )}
          <div className="p-4 px-2 mt-10" id="order1">
            <OrderForm prod={id} cart={false} modify={false}></OrderForm>
          </div>
          <div className="overflow-auto">
            {product.vidlink && (
              <div>
                <h1 className="text-center text-2xl font-semibold mt-5 ">
                  {t("vid")}
                </h1>
                <div className="flex justify-center">
                  <iframe
                    src={
                      "https://www.facebook.com/plugins/video.php?href=" +
                      product.vidlink +
                      "&show_text=true&t=0"
                    }
                    className="h-[100vh] border-0 w-auto overflow-hidden"
                    scrolling="no"
                    frameborder="0"
                    allowfullscreen="true"
                    allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                    allowFullScreen="true"
                  ></iframe>
                </div>
              </div>
            )}
          </div>
          <div className="overflow-auto ">
            <div className="bg-white border-t-2 border-teal-900 w-full ">
              <h1 className="text-center text-2xl font-semibold  mb-4">
                {t("imgs")}
              </h1>
              {product.images.map((image) => (
                <div key={image} className="">
                  <Image
                    alt="image"
                    className="over-flow-hidden justify-center mx-auto  "
                    height={500}
                    width={500}
                    src={image}
                  ></Image>
                </div>
              ))}
            </div>
          </div>
        </Layout>
      </div>
      <div className="hidden lg:flex">
        <Layout>
          <div className="grid grid-cols-2 gap-3 p-4  ">
            <div className=" ">
              <div
                id="img cont"
                className=" mt-4 outline-none border-b-2 border-solid border-gray-400 p-6 rounded-lg bg-white shadow "
              >
                <Carousel data={product.images} />
              </div>
              <div className="flex flex-row mt-8 gap-6 justify-center">
                <Link
                  href="#order2"
                  className=" text-center 2xl:px-24 xl:px-20 lg:px-12 py-2 2xl:py-3 lg:text-lg xl:text-xl  bg-orange-500 hover:scale-105 text-white rounded-xl shadow-md  transition-all duration-300"
                >
                  {t("ach")}
                </Link>
                <button
                  onClick={() => addProduct(product._id)}
                  className=" 2xl:px-26 xl:px-20 lg:px-14 py-1 2xl:py-2 lg:text-lg xl:text-xl hover:bg-teal-600 hover:scale-105  bg-gray-700 text-white  transition-all duration-300  rounded-xl shadow-md"
                >
                  {t("ajt")}
                </button>
              </div>
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
                <h2 className="text-md  ps-4 font-mono mt-3 md:text-xl">
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

              <div id="text" className="ml-3">
                <div id="title">
                  <h3 className="text-2xl font-medium mt-12">
                    {t("prodt", {
                      name: product.title,
                      namear:
                        product.title_ar.length > 2
                          ? product.title_ar
                          : product.title,
                    })}
                  </h3>
                </div>
                <div id="price" className="mt-6">
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

                <div className="flex flex-row-reverse mt-10 ">
                  <div className="w-1/2">
                    {" "}
                    {product.summary2 && (
                      <p className="font-bold xl:text-lg mr-1 p-4  right-12 text-gray-500 text-pretty  indent-2">
                        {t("summ2", {
                          summ2: product?.summary2,
                          summ2ar:
                            product?.summary2_ar.length > 2
                              ? product?.summary2_ar
                              : product?.summary2,
                        })}
                      </p>
                    )}
                  </div>
                  <div id="specs" className="w-1/2 xl:scale-105 2xl:scale-110 ">
                    {product.specValues[1] && !product.specValues[2] && (
                      <div className="flex p-4  justify-center  ">
                        <div className="flex flex-row gap-4">
                          <div class="m-auto  box-md rounded-2xl p-5 shadow-xl bg-gray-100 py-10 text-black ">
                            <div className="text-center jutify-center text-3xl text-teal-600">
                              {product.specIcons[0]}
                            </div>

                            <h2 className="text-center text-2xl text-teal-600 my-3">
                              {" "}
                              {product.specValues[0]}
                            </h2>
                            <p className="pt-1 text-center">
                              {locale == "ar" &&
                              product.specDescs_ar[0].length > 2
                                ? product.specDescs_ar[0]
                                : product.specDescs[0]}
                            </p>
                          </div>

                          <div class="m-auto  box-md rounded-2xl p-5 shadow-xl bg-gray-100 py-10 text-black ">
                            <div className="text-center jutify-center text-3xl text-teal-600">
                              {product.specIcons[1]}
                            </div>

                            <h2 className="text-center text-2xl text-teal-600 my-3">
                              {" "}
                              {product.specValues[1]}
                            </h2>
                            <p className="pt-1 text-center">
                              {locale == "ar" &&
                              product.specDescs_ar[1].length > 2
                                ? product.specDescs_ar[1]
                                : product.specDescs[1]}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    {product.specValues[2] && (
                      <div className="flex p-4 justify-center  ">
                        <div className="flex   flex-row gap-4">
                          <div class="m-auto  box-md rounded-2xl p-5 shadow-xl bg-gray-100 py-10 text-black ">
                            <div className="text-center jutify-center text-3xl text-teal-600">
                              {product.specIcons[0]}
                            </div>

                            <h2 className="text-center text-2xl text-teal-600 my-3">
                              {" "}
                              {product.specValues[0]}
                            </h2>
                            <p className="pt-1 text-center">
                              {locale == "ar" &&
                              product.specDescs_ar[0].length > 2
                                ? product.specDescs_ar[0]
                                : product.specDescs[0]}
                            </p>
                          </div>

                          <div className="flex flex-col gap-3">
                            <div class="box-sm ring-black rounded-xl p-2 shadow-xl bg-gray-100 py-4 text-black ">
                              {" "}
                              <div className="text-center jutify-center text-2xl text-teal-600">
                                {product.specIcons[1]}
                              </div>
                              <h2 className="text-center  text-teal-600">
                                {product.specValues[1]}
                              </h2>
                              <p className="pt-1 text-sm text-center">
                                {locale == "ar" &&
                                product.specDescs_ar[1].length > 2
                                  ? product.specDescs_ar[1]
                                  : product.specDescs[1]}
                              </p>
                            </div>

                            <div class="box-sm ring-black rounded-xl p-2 shadow-xl bg-gray-100 py-4 text-black ">
                              {" "}
                              <div className="text-center jutify-center text-2xl text-teal-600">
                                {product.specIcons[2]}
                              </div>
                              <h2 className="text-center  text-teal-600">
                                {product.specValues[2]}
                              </h2>
                              <p className="pt-1 text-sm text-center">
                                {locale == "ar" &&
                                product.specDescs_ar[2].length > 2
                                  ? product.specDescs_ar[2]
                                  : product.specDescs[2]}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div id="desc" className="mt-12 text-base  block col-span-2 w-full">
              <h4 className="text-xl  font-medium">{t("desc")}:</h4>
              <pre
                className={`text-wrap font-sans bg-gradient-to-br from-gray-200 to-gray-300 rounded-xl p-4 text-lg mt-2 transition-all duration-300 ${
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
            <div className="col-span-2 mt-4 " id="order2">
              <div className="w-[90%] p-4 justify-center mx-auto border-2 border-black rounded-2xl bg-white ">
                <OrderForm prod={id} cart={false} modify={false} />
              </div>
              {product.vidlink && (
                <div>
                  <h1 className="text-2xl font-medium mt-16 mb-5">
                    {t("vid")}:
                  </h1>
                  <div className="flex justify-center">
                    <iframe
                      src={
                        "https://www.facebook.com/plugins/video.php?href=" +
                        product.vidlink +
                        "&show_text=true&t=0"
                      }
                      className="h-[80vh] border-0 w-auto overflow-hidden"
                      scrolling="no"
                      frameborder="0"
                      allowfullscreen="true"
                      allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                      allowFullScreen="true"
                    ></iframe>
                  </div>
                </div>
              )}
            </div>
            <div className="col-span-2 overflow-hidden">
              {category && (
                <Category
                  key={category._id}
                  categoryid={category._id}
                ></Category>
              )}
            </div>
            <div className="col-span-2">
              {brand && <Brand key={brand._id} brandid={brand._id}></Brand>}
            </div>
          </div>
        </Layout>
      </div>
    </div>
  );
}
