"use client";
import { useState, useEffect, useRef, useCallback, useContext } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { usePathname } from "next/navigation";

import { CartContext } from "./cartContext";
import { Link } from "@/i18n/navigation";

export default function Brand({ brandid }) {
  const checkoutT = useTranslations("checkout");
  const commonT = useTranslations("common");
  const { addProduct } = useContext(CartContext);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const pathname = usePathname();
  const observer = useRef();

  const lastProductElementRef = useCallback((node) => {
    if (isLoadingMore) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore) {
        setPage((prevPage) => prevPage + 1);
      }
    });
    if (node) observer.current.observe(node);
  }, [isLoadingMore, hasMore]);

  const fetchBrandProducts = useCallback(async (pageNum = 1, reset = false) => {
    try {
      setIsLoadingMore(true);
      const response = await fetch(`/api/track?brand=${brandid || ""}&page=${pageNum}&limit=10`);
      const data = await response.json();
      const nextProducts = data.products ?? [];

      setProducts((prev) => (reset ? nextProducts : [...prev, ...nextProducts]));
      setHasMore(data.pagination?.hasMore || false);
    } catch (error) {
      console.error(error);
      setHasMore(false);
    } finally {
      setIsLoadingMore(false);
      setLoading(false);
    }
  }, [brandid]);

  useEffect(() => {
    setLoading(true);
    setPage(1);
    setHasMore(true);
    setProducts([]);
    fetchBrandProducts(1, true);
  }, [brandid, fetchBrandProducts]);

  useEffect(() => {
    if (page > 1) {
      fetchBrandProducts(page, false);
    }
  }, [page, fetchBrandProducts]);

  if (loading && products.length === 0) {
    return (
      <div className="sf-container py-8 text-center">
        <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2 border-teal-700" />
        <p className="text-sm text-slate-600">{commonT("Loadingsearch")}</p>
      </div>
    );
  }

  if (products.length < 4 || !products[0]?.images?.[0]) {
    return null;
  }

  return (
    <section className="overflow-hidden">
      <div className="sf-container text-center">
        <h1 className="sf-title mt-8 text-3xl">
          {pathname.includes("/products") || pathname.includes("/landing") ? `${commonT("simps")}:` : checkoutT("brand")}
        </h1>
      </div>

      <div className="sf-container mt-6 px-0">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {products.map((product, index) => (
            <article
              key={`${product._id}-${index}`}
              ref={index === products.length - 1 ? lastProductElementRef : null}
              className="sf-card overflow-hidden p-3"
            >
              <Link href={`/products/${product.slug}`} className="sf-image-frame flex h-[10rem] items-center justify-center p-3 lg:h-[12rem]">
                <Image
                  src={product.images[0]}
                  width={320}
                  height={320}
                  alt="product-img"
                  className="h-full w-full object-contain transition duration-300 hover:scale-105"
                  loading="lazy"
                  sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                />
              </Link>

              <Link target="_blank" href={`/products/${product.slug}`}>
                <h1 className="mt-3 line-clamp-2 px-2 text-center text-sm font-semibold text-slate-900 transition-colors duration-300 hover:text-teal-700 lg:text-base">
                  {commonT("prodt", {
                    name: product.title,
                    namear: product.title_ar?.length > 2 ? product.title_ar : product.title,
                  })}
                </h1>
              </Link>

              <div className="mt-3 flex items-center justify-center gap-3 pb-1">
                <h1 className="font-semibold text-teal-700 md:text-xl">
                  {product.price}
                  {commonT("da")}
                </h1>

                <button
                  onClick={() => {
                    product.stock > 0 && addProduct(product._id, product);
                  }}
                  className="sf-button px-3 py-1.5"
                >
                  +
                </button>
              </div>
            </article>
          ))}
        </div>

        {isLoadingMore ? (
          <div className="py-4 text-center">
            <div className="mx-auto inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-teal-700"></div>
            <p className="mt-2 text-slate-600">{commonT("LoadingMore")}</p>
          </div>
        ) : null}

        {!hasMore && products.length > 0 ? (
          <div className="py-4 text-center text-slate-500">
            <p>{commonT("noMoreProducts")}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
