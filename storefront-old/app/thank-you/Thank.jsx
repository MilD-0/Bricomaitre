"use client";
import Link from "next/link";
import Layout from "../components/layout";
import Card from "../components/Card";
import Brand from "../components/Brand";
import Category from "../components/Category";
import { useContext, useEffect, useRef, useState } from "react";
import { CartContext } from "../components/cartContext";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import Image from "next/image";

export default function ThankYou() {
  const s = typeof window !== "undefined" ? window.localStorage : null;
  const { clearCart } = useContext(CartContext);
  const bought = s?.getItem("cartProducts").split(",");
  const searchParams = useSearchParams();
  const [mod, setMod] = useState(searchParams.get("modified") || false);
  if (mod) {
    clearCart();
    setMod(false);
  }
  const t = useTranslations("thx");
  const f = useTranslations("common");
  const c = useTranslations("checkout");
  const [featuredBrands, setFeaturedBrands] = useState(null);
  const [categories, setCategories] = useState(null);
  const [products, setProducts] = useState(null);
  const [prods, setProds] = useState([]);

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

  const usePrevious = (value) => {
    const ref = useRef();
    useEffect(() => {
      ref.current = value;
    });
    return ref.current;
  };
  const prevBought = usePrevious(bought);
  useEffect(() => {
    if (bought.length > 0 && bought !== prevBought) {
      fetch("/api/cart", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: bought }),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error("Failed to fetch products");
          }
          return response.json();
        })
        .then((data) => {
          setProds(data);
        })
        .catch((error) => {
          console.error(error);
        });
    } else {
      setProds([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Layout>
      <div className="flex flex-col justify-center items-center">
        <div className="text-center text-green-600 animate-pulse text-3xl px-4 font-semibold pt-20 mb-5">
          {t("mrc")}
        </div>
        {prods?.length && (
          <div className="w-[90%] md:w-1/2 lg:w-1/3">
            {prods.map((product) => (
              <div
                key={product._id}
                className="flex  m-4 flex-row rounded-lg border-2 border-gray-400  bg-white  p-4  mb-1 justify-between mx-auto border-solid "
              >
                <Link
                  target="_blank"
                  className="w-2/5"
                  href={`/products/${product._id}`}
                >
                  <Image
                    src={product.images[0]}
                    alt="product image"
                    width={120}
                    height={120}
                    className="mt-1"
                  />
                </Link>
                <Link
                  target="_blank"
                  href={`/products/${product._id}`}
                  className=" mx-2 w-3/5 "
                >
                  <div className=" font-semibold text-sm mt-2">
                    {f("prodt", {
                      name: product.title,
                      namear:
                        product.title_ar.length > 2
                          ? product.title_ar
                          : product.title,
                    })}
                  </div>
                  <div className="">
                    <span className="font-bold text-md text-emerald-700 ">
                      {product.price}
                      {f("da")}
                    </span>
                  </div>
                  <div className="text-lg">
                    {c("quant")}:{" "}
                    {bought.filter((id) => id === product._id).length}
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
        <div className="text-center text-3xl px-4 font-semibold pt-20 mb-5">
          {c("info")}
          {bought[1]?.title}
        </div>
        <div className="w-[90%] p-4 rounded-xl bg-white ring-2 ring-black">
          {s.getItem("firstName") && (
            <h1 className="text-lg mb-1">
              <span className="mb-2 font-semibold">{c("nom")}</span>:{" "}
              {s.getItem("firstName")} {s.getItem("lastName")}
            </h1>
          )}
          {s.getItem("state") && (
            <h1 className="text-lg mb-1">
              <span className="mb-2 font-semibold">{c("wil")}</span>:{" "}
              {s.getItem("state")}
            </h1>
          )}
          {s.getItem("city") && (
            <h1 className="text-lg mb-1">
              <span className="mb-2 font-semibold">{c("comm")}</span>:{" "}
              {s.getItem("city")}
            </h1>
          )}
          {s.getItem("homeAddress") && (
            <h1 className="text-lg mb-1">
              <span className="mb-2 font-semibold">{c("addr")}</span>:{" "}
              {s.getItem("homeAddress")}
            </h1>
          )}
          <h1 className="text-lg mb-1">
            <span className="mb-2 font-semibold">{c("tel")}</span>:{" "}
            {s.getItem("phoneNumber1")}
          </h1>
          {s.getItem("phoneNumber2") && (
            <h1 className="text-lg mb-1">
              <span className="mb-2 font-semibold">{c("tel2")}</span>:{" "}
              {s.getItem("phoneNumber2")}
            </h1>
          )}
          <h1 className="text-lg mb-1">
            <span className="mb-2 font-semibold">{c("livr")}</span>:{" "}
            {s.getItem("delivery") == "home" ? c("lv1") : c("lv2")}
          </h1>
          <h1 className="text-lg mb-1">
            <span className="mb-2 font-semibold">{c("liv")}</span>:{" "}
            <span className="text-emerald-800 font-semibold">
              {s.getItem("del_pr")}
              {c("da")}
            </span>
          </h1>

          <h1 className="text-lg mb-1">
            <span className="mb-2 font-semibold">{c("sous")}</span>:{" "}
            <span className="text-emerald-800 font-semibold">
              {s.getItem("subtotal")}
              {c("da")}
            </span>
          </h1>
          <h1 className="text-lg mb-1">
            <span className="mb-2 font-semibold">{c("tot")}</span>:{" "}
            <span className="text-emerald-800 font-semibold">
              {Number(s.getItem("del_pr")) + Number(s.getItem("subtotal"))}
              {c("da")}
            </span>
          </h1>
        </div>
        <Link
          href="/checkout?order=1"
          className="w-[60%] mx-2 lg:mx-0 lg:w-1/3 mt-2  bg-teal-600 px-6 py-2 text-center rounded-lg text-2xl font-semibold text-white mb-4"
        >
          {c("modi")}
        </Link>
        <div className="p-2 text-3xl font-semibold pt-20 mb-5">{t("va")}:</div>
        {products && (
          <div className="flex flex-wrap gap-2 px-2">
            {products.map((product) => (
              <Card key={product._id} id={product._id} />
            ))}
          </div>
        )}

        <Link
          href="/products"
          className="w-[90%] mx-2 lg:mx-0 lg:w-1/2 animate-pulse duration-200 bg-teal-600 px-6 py-2 text-center rounded-lg text-2xl font-semibold text-white mb-4"
        >
          {t("vp")}
        </Link>
      </div>
      {featuredBrands &&
        featuredBrands.map((featuredBrand) => (
          <Brand key={featuredBrand._id} brandid={featuredBrand._id} />
        ))}
      {categories &&
        categories.map((category) => (
          <Category key={category._id} categoryid={category._id} />
        ))}
    </Layout>
  );
}
