"use client";

import { useLocale, useTranslations } from "next-intl";
import { CartContext } from "@/app/components/cartContext";
import { useContext } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Image from "next/image";
import { toAnalyticsItem, trackAnalyticsEvent } from "@/lib/analytics";
import { Link } from "@/i18n/navigation";

export default function Embla({ products }) {
  const t = useTranslations("common");
  const locale = useLocale();
  const { addProduct } = useContext(CartContext);
  const dir = locale === "ar" ? "rtl" : "ltr";
  const OPTIONS = { dragFree: true, loop: true, direction: dir };
  const [emblaRef] = useEmblaCarousel(OPTIONS);
  const trackSelectItem = (product) => {
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
        listName: "featured_carousel",
      },
      gaParams: {
        item_list_name: "featured_carousel",
        items: [analyticsItem],
      },
    });
  };

  return (
    <section className="embla py-2" style={{ "--slide-spacing": "0.75rem" }}>
      <div className="embla__viewport" ref={emblaRef}>
        <div className="embla__container">
          {products.map((product) => (
            <div key={product._id} className="embla__slide">
              <Link href={`/products/${product.slug}`} onClick={() => trackSelectItem(product)}>
                <div className="sf-image-frame flex h-[11rem] items-center justify-center p-3 lg:h-[12rem]">
                  <Image
                    src={product.images[0]}
                    height={600}
                    width={600}
                    alt="product-img"
                    style={{ objectFit: "contain" }}
                    className="h-full w-full transform transition duration-300 hover:scale-105"
                    sizes="(max-width: 768px) 75vw, (max-width: 1200px) 33vw, 25vw"
                  />
                </div>
              </Link>
              <Link target="_blank" href={`/products/${product.slug}`} onClick={() => trackSelectItem(product)}>
                <h1 className="mt-3 line-clamp-2 text-center text-sm font-semibold text-slate-900 transition-colors duration-300 hover:text-teal-700">
                  {t("prodt", {
                    name: product.title,
                    namear:
                      product.title_ar.length > 2
                        ? product.title_ar
                        : product.title,
                  })}
                </h1>
              </Link>
              <div className="mt-2 flex items-center justify-center gap-3 px-2">
                <h1 className="text-lg font-semibold text-teal-700">
                  {product.price}
                  {t("da")}
                </h1>

                <button
                  onClick={() => {
                    product.stock > 0 && addProduct(product._id, product);
                  }}
                  className="sf-button px-3 py-1.5"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                    className="mx-auto size-5 md:size-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
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
