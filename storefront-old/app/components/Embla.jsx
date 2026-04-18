"use client";

import { useLocale, useTranslations } from "next-intl";
import { CartContext } from "@/app/components/cartContext";
import { useContext } from "react";
import Link from "next/link";
import useEmblaCarousel from "embla-carousel-react";
import Image from "next/image";

export default function Embla({ products }) {
  const t = useTranslations("common");
  const locale = useLocale();
  const { addProduct } = useContext(CartContext);
  const dir = locale === "ar" ? "rtl" : "ltr";
  const OPTIONS = { dragFree: true, loop: true, direction: dir };
  const [emblaRef] = useEmblaCarousel(OPTIONS);

  return (
    <section className="embla py-2">
      <div className="embla__viewport" ref={emblaRef}>
        <div className="embla__container">
          {products.map((product) => (
            <div key={product._id} className="  embla__slide">
              {" "}
              <Link href={"/products/" + product._id}>
                <div className="  rounded-2xl overflow-hidden  flex h-[10rem] lg:h-[10rem] xl:h-[12rem] 2xl:h-[16rem] p-2 relative  bg-white ">
                  <Image
                    src={product.images[0]}
                    height={600}
                    width={600}
                    alt="product-img"
                    style={{ objectFit: "contain" }}
                    className="hover:scale-125 transform transition duration-300  "
                  />
                </div>
              </Link>
              <Link target="_blank" href={"/products/" + product._id}>
                <h1 className="font-semibold text-sm text-ellipsis text-wrap hover:text-teal-600 transition-colors duration-300 text-center  line-clamp-2 lg:text-base">
                  {t("prodt", {
                    name: product.title,
                    namear:
                      product.title_ar.length > 2
                        ? product.title_ar
                        : product.title,
                  })}
                </h1>
              </Link>
              <div className="flex px-8 items-center justify-center gap-4 ">
                <h1 className="font-semibold  md:text-xl text-emerald-700">
                  {product.price}
                  {t("da")}
                </h1>

                <button
                  onClick={() => {
                    product.stock > 0 && addProduct(product._id);
                  }}
                  className="    bg-teal-600  text-white py-1 text-center w-1/3 rounded-full hover:bg-teal-500 transition-colors duration-200 flex px-3 flex-row"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="1.5"
                    stroke="currentColor"
                    class="mx-auto p-0 m-0  size-7 md:size-6 "
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
