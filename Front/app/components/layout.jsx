"use client";
import Link from "next/link";
import Logo from "./logo";
import Footer from "./Footer";
import { Suspense, useContext } from "react";
import { usePathname } from "next/navigation";

import { useState } from "react";

import Search from "./search";
import { useLocale, useTranslations } from "next-intl";
import { CartContext } from "./cartContext";
import Image from "next/image";

import { useTransition } from "react";

import { setUserLocale } from "@/i18n/locale";

export default function Layout({ children }) {
  const locale = useLocale();

  const [results, setResults] = useState([]);
  const { cartProducts } = useContext(CartContext);
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("Layout");
  const s = typeof window !== "undefined" ? window.localStorage : null;
  function onChange(locale) {
    startTransition(() => {
      setUserLocale(locale);
      s?.setItem("lo", locale);
    });
  }

  const inactiveLink = "";
  const inactiveIcon = "";
  const activeLocale = "text-white bg-teal-600";
  const inactiveLocale = "";
  const activeIcon = " text-teal-600 ";
  const activeLink =
    inactiveLink +
    " underline underline-offset-3 decoration-2 decoration-teal-600 ";
  const pathname = usePathname();
  if (!locale) {
    return null;
  }
  return (
    <div className="">
      <div
        className={
          (pathname.includes("/cart")
            ? "bg-white"
            : " bg-gradient-to-tl from-gray-100 to-teal-50 ") +
          "  w-full  bg-gray-100 min-h-screen text-gray-800  border-gray-700  border-b-2 "
        }
      >
        <div
          className={
            " flex md:fixed top-0  z-50 w-full p-2 pt-2 flex-col shadow " +
            (pathname.includes("/cart") ? "bg-gray-100" : "bg-white ")
          }
        >
          <div className=" static ms-7 mt-1  flex-row justify-between mb-1">
            <Logo />
            <div className="align-middle text-end  gap-2  -mt-8 flex ">
              <div className="flex md:justify-center mx-auto me-2 md:me-auto  bg-green-500 text-gray-100 rounded-full font-medium  px-1.5 pt-1 align-middle">
                <div className="md:hidden  animate-[pulse_4s_ease-in-out_infinite] me-0">
                  {" "}
                  <Link dir="ltr" href={`tel:0778 81 03 60`}>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="white"
                      viewBox="0 0 24 24"
                      stroke-width="1.5"
                      stroke="currentColor"
                      class="size-5 mt-0.5"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z"
                      />
                    </svg>
                  </Link>
                </div>
                <div
                  dir="ltr"
                  className="hidden md:flex  mx-auto me-auto  justify-center"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="white"
                    viewBox="0 0 24 24"
                    stroke-width="1.5"
                    stroke="currentColor"
                    class="size-5 mt-0.5"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z"
                    />
                  </svg>
                  :0778 81 03 60
                </div>
              </div>
              <div className="flex  me-2 pe-0 justify-end">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="1.5"
                  stroke="currentColor"
                  class="size-8"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"
                  />
                </svg>
                <div className="bg-gray-100 ring-2 ring-gray-300 flex gap-2 px-2 rounded-full  transition-colors duration-1000 py-1 ">
                  <button
                    className={
                      (locale == "fr" ? activeLocale : inactiveLocale) +
                      " px-3 rounded-xl hover:ring-1 ring-teal-700 transition-colors duration-1000 "
                    }
                    onClick={() => {
                      if (locale != "fr") {
                        onChange("fr");
                      }
                    }}
                  >
                    FR
                  </button>
                  <button
                    className={
                      (locale == "ar"
                        ? " text-white bg-teal-600 "
                        : inactiveLocale) +
                      " px-3 rounded-xl hover:ring-1 ring-teal-700 transition-colors duration-1000 colors:animate-slide"
                    }
                    onClick={() => {
                      if (locale !== "ar") {
                        onChange("ar");
                      }
                    }}
                  >
                    ع
                  </button>
                </div>
              </div>
            </div>
          </div>

          <Suspense>
            {" "}
            <Search setResults={setResults} />
          </Suspense>

          <div className="relative ">
            {results.length > 0 && (
              <div className="absolute  bg-white rounded-lg top w-full drop-shadow-lg z-50">
                <div>
                  {results.map((product) => (
                    <div key={product._id} className="flex flex-row    ">
                      <Link href={`/products/${product._id}`}>
                        <div className=" mx-1 flex mt-1 p-1">
                          <Image
                            src={product.images[0]}
                            alt="product image"
                            width={90}
                            height={90}
                            className="p-1 pt-0 mr-2 mt-2"
                          />
                          <div className="pb-1 ">
                            <div className=" font-semibold text-sm ">
                              {product.title}
                            </div>
                            <div className="">
                              <span className="font-bold text-md text-emerald-700 ">
                                {product.price}
                                {t("da")}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex-row  text-center pt-5 font-semibold text-sm lg:text-base">
            <Link
              href={"/"}
              className={
                (pathname === "/" ? activeLink : inactiveLink) +
                "float-left w-1/3 md:w-1/4 "
              }
            >
              {t("acc")}
            </Link>
            <Link
              href={"/products"}
              className={
                (pathname.includes("/products") ? activeLink : inactiveLink) +
                "float-left w-1/3 md:w-1/4 "
              }
            >
              {t("prods")}
            </Link>
            <Link
              href={"/contact"}
              className={
                (pathname.includes("/contact") ? activeLink : inactiveLink) +
                "float-left w-1/3 md:w-1/4 "
              }
            >
              {t("con")}
            </Link>
            <Link
              href={"/cart"}
              className={
                (pathname.includes("/cart") ? activeLink : inactiveLink) +
                "float-left w-1/3 md:w-1/4 text-base hidden md:block   "
              }
            >
              {t("cart")}
              <span className={cartProducts.length > 0 ? "" : "hidden"}>
                :{" "}
                <span
                  className={
                    cartProducts.length > 0
                      ? " bg-red-500 rounded-full px-1 text-sm decoration-transparent"
                      : ""
                  }
                >
                  {cartProducts.length}
                </span>
              </span>
            </Link>
          </div>
        </div>
        <div>
          <div className="  md:mt-36   ">{children}</div>
        </div>
      </div>

      {!pathname.includes("/products/") && !pathname.includes("/landing/") && (
        <div
          className={
            (pathname.includes("/cart") ? "bg-gray-100" : "bg-white") +
            " sticky bottom-0 w-full 0 py-2.5 z-50 lg:hidden drop-shadow shadow-inner overflow-visible"
          }
        >
          <div className="flex  text-center w-full ">
            <Link
              href={"/products"}
              className={
                (pathname.includes("/products") ? activeIcon : inactiveIcon) +
                " z-2  block m-auto px-1"
              }
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
                class="size-9"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z"
                />
              </svg>
            </Link>
            <Link
              href={"/"}
              className={
                (pathname === "/" ? activeIcon : inactiveIcon) +
                "  block m-auto px-1"
              }
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
                class="size-9"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
                />
              </svg>
            </Link>
            <Link
              href={"/cart"}
              className={
                (pathname.includes("/cart") ? activeIcon : inactiveIcon) +
                "block m-auto px-1 relative"
              }
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
                class="size-9"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
                />
              </svg>
              {cartProducts.length > 0 ? (
                <div className="rounded-full font-semibold bg-red-600 w-4 h-4 absolute top-0 right-0 text-xs  text-black">
                  {cartProducts.length}
                </div>
              ) : (
                <></>
              )}
            </Link>
          </div>
        </div>
      )}

      {!pathname.includes("/products/") && !pathname.includes("/landing/") && (
        <Footer />
      )}
    </div>
  );
}
