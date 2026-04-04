"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";

import { CartContext } from "./cartContext";
import { buildCategoryFilterHref } from "@/lib/storefront-api";
import { Link, usePathname } from "@/i18n/navigation";

const PAGE_SIZE = 8;

export default function Similar({ categoryid, productId }) {
  const t = useTranslations("common");
  const pathname = usePathname();
  const { addProduct } = useContext(CartContext);
  const observer = useRef();

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const fetchRecommendations = useCallback(
    async (pageNum = 1, reset = false) => {
      try {
        setIsLoadingMore(true);

        const recommendationUrl = productId
          ? `/api/similar?productId=${productId}&page=${pageNum}&limit=${PAGE_SIZE}&instock=true`
          : `/api/track?category=${categoryid || ""}&page=${pageNum}&limit=${PAGE_SIZE}`;

        const [productsResponse, categoryResponse] = await Promise.all([
          fetch(recommendationUrl),
          categoryid && pageNum === 1 ? fetch(`/api/category?id=${categoryid}`) : Promise.resolve(null),
        ]);

        const productData = await productsResponse.json();
        const nextProducts = productData?.products ?? [];
        const categoryData = categoryResponse ? await categoryResponse.json() : null;

        setProducts((prev) => (reset ? nextProducts : [...prev, ...nextProducts]));
        setHasMore(Boolean(productData?.pagination?.hasMore));

        if (categoryData) {
          setCategory(categoryData);
        }
      } catch (error) {
        console.error(error);
        setHasMore(false);
      } finally {
        setIsLoadingMore(false);
        setLoading(false);
      }
    },
    [categoryid, productId],
  );

  useEffect(() => {
    setLoading(true);
    setProducts([]);
    setCategory("");
    setPage(1);
    setHasMore(true);
    fetchRecommendations(1, true);
  }, [fetchRecommendations]);

  useEffect(() => {
    if (page > 1) {
      fetchRecommendations(page, false);
    }
  }, [page, fetchRecommendations]);

  const lastProductElementRef = useCallback(
    (node) => {
      if (isLoadingMore) {
        return;
      }
      if (observer.current) {
        observer.current.disconnect();
      }
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          setPage((prevPage) => prevPage + 1);
        }
      });
      if (node) {
        observer.current.observe(node);
      }
    },
    [hasMore, isLoadingMore],
  );

  if (loading && products.length === 0) {
    return (
      <div className="sf-container py-8 text-center">
        <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2 border-teal-700" />
        <p className="text-sm text-slate-600">{t("Loadingsearch")}</p>
      </div>
    );
  }

  if (products.length < 4 || !products[0]?.images?.[0]) {
    return null;
  }

  return (
    <section className="overflow-hidden">
      <div className="sf-container text-center">
        {pathname.includes("/products") || pathname.includes("/landing") ? (
          <h1 className="sf-title mt-8 text-3xl">{t("simps")}:</h1>
        ) : (
          <h1 className="sf-title mt-8 text-3xl">
            {t("cat")}{" "}
            {t("catn", {
              catn: category?.name,
              catnar: category?.name_ar?.length > 2 ? category?.name_ar : category?.name,
            })}
          </h1>
        )}
      </div>

      <div className="sf-container mt-6 px-0">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">
          {products.map((product, index) => (
            <article
              key={`${product._id}-${index}`}
              ref={index === products.length - 1 ? lastProductElementRef : null}
              className="sf-card relative overflow-hidden p-3"
            >
              <Link
                href={`/products/${product.slug}`}
                className="sf-image-frame flex h-[13rem] items-center justify-center p-3 lg:h-[14rem] xl:h-[14rem] 2xl:h-[18rem]"
              >
                <Image
                  src={product.images[0]}
                  width={320}
                  height={320}
                  alt="product-img"
                  className="h-full w-full object-contain transition duration-300 hover:scale-105"
                  loading="lazy"
                  sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw"
                />
              </Link>

              <Link href={`/products/${product.slug}`}>
                <h2 className="mt-4 line-clamp-2 text-sm font-semibold text-slate-900 transition-colors duration-300 hover:text-teal-700 lg:text-base">
                  {t("prodt", {
                    name: product.title,
                    namear: product.title_ar?.length > 2 ? product.title_ar : product.title,
                  })}
                </h2>
              </Link>

              {product.OldPrice ? (
                <span className="mt-2 block text-sm font-medium text-orange-600 line-through lg:text-base">
                  {product.OldPrice}
                  {t("da")}
                </span>
              ) : null}

              <span className="mt-1 block text-sm font-bold text-teal-700 lg:text-lg">
                {product.price}
                {t("da")}
              </span>

              <p
                className={`pb-12 pt-2 text-xs font-medium lg:text-sm ${
                  product.stock > 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {product.inStock ? t("es") : t("ns")}
              </p>

              {product.stock > 0 ? (
                <div className="absolute bottom-1 my-1.5 flex w-full justify-center px-1 pb-2">
                  <button
                    onClick={() => {
                      addProduct(product._id, product);
                    }}
                    className="sf-button w-10/12 py-2"
                    type="button"
                    aria-label={`Add ${product.title} to cart`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="1.5"
                      stroke="currentColor"
                      className="mx-auto size-5"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
                      />
                    </svg>
                  </button>
                </div>
              ) : null}

              <div className="absolute bottom-2 left-3 right-3 h-px bg-slate-200" />
            </article>
          ))}
        </div>

        {isLoadingMore ? (
          <div className="py-4 text-center">
            <div className="mx-auto inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-teal-700" />
            <p className="mt-2 text-slate-600">{t("LoadingMore")}</p>
          </div>
        ) : null}

        {!hasMore && products.length > 0 ? (
          <div className="py-4 text-center text-slate-500">
            <p>{t("noMoreProducts")}</p>
          </div>
        ) : null}
      </div>

      {category && !productId ? (
        <div className="sf-container mt-4 flex justify-center">
          <Link href={buildCategoryFilterHref({ category })} className="sf-button">
            {t("vp")}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
