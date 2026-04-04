"use client";
import Image from "next/image";
import Layout from "../components/layout";
import SearchBar from "../components/SearchBar";
import {
  useState,
  useEffect,
  useContext,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useSearchParams } from "next/navigation";

import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

import { CartContext } from "../components/cartContext";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import FilterSortBar from "../components/FilterSortBar";
import FilterSliders from "../components/FilterSliders";
import { ProductGridSkeleton } from "../components/ui";

const PRODUCTS_STATE_PREFIX = "products_state_v1";

export default function Products({
  forcedBrandSlug = "",
  forcedCategorySlug = "",
  pageTitle = "",
  pageDescription = "",
  initialData = null,
}) {
  const t = useTranslations("common");
  const searchParams = useSearchParams();
  const initialProducts = useMemo(() => initialData?.products ?? [], [initialData]);
  const initialPagination = useMemo(() => initialData?.pagination ?? null, [initialData]);
  const initialFilters = useMemo(
    () => initialData?.filters ?? { categories: [], brands: [] },
    [initialData],
  );

  function insertDot(num) {
    let numStr = num.toString();
    if (numStr.length >= 4) {
      return numStr.slice(0, -3) + "." + numStr.slice(-3);
    }
    return numStr;
  }

  const observer = useRef();
  const scrollRestorationAttempted = useRef(false);
  const [products, setProducts] = useState(initialProducts);
  const [loading, setLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialPagination?.hasMore ?? false);
  const [currentPage, setCurrentPage] = useState(initialPagination?.currentPage ?? 1);
  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentParams, setCurrentParams] = useState("");
  const [totalCount, setTotalCount] = useState(initialPagination?.totalCount ?? null);

  const limit = 20;
  const resolvedPageTitle = pageTitle || t("prods");
  const categories = initialFilters.categories;
  const brands = initialFilters.brands;

  const buildEffectiveParams = useCallback(() => {
    const params = new URLSearchParams();

    if (forcedCategorySlug) {
      params.set("category", forcedCategorySlug);
    }

    if (forcedBrandSlug) {
      params.set("brand", forcedBrandSlug);
    }

    searchParams.forEach((value, key) => {
      if (key === "page" || key === "limit") {
        return;
      }

      if (forcedCategorySlug && key === "category") {
        return;
      }

      if (forcedBrandSlug && key === "brand") {
        return;
      }

      params.set(key, value);
    });

    return params;
  }, [forcedBrandSlug, forcedCategorySlug, searchParams]);

  const getStateKey = useCallback(() => {
    const params = buildEffectiveParams();
    params.sort();
    return `${PRODUCTS_STATE_PREFIX}_${params.toString()}`;
  }, [buildEffectiveParams]);

  const saveState = useCallback((nextState) => {
    const effectiveParams = buildEffectiveParams().toString();

    try {
      sessionStorage.setItem(
        getStateKey(),
        JSON.stringify({
          ...nextState,
          params: effectiveParams,
          scrollPosition: window.scrollY,
        }),
      );
    } catch (error) {
      console.error("Failed to save products state:", error);
    }
  }, [buildEffectiveParams, getStateKey]);

  const loadState = useCallback(() => {
    const effectiveParams = buildEffectiveParams().toString();

    try {
      const raw = sessionStorage.getItem(getStateKey());
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw);
      if (parsed.params !== effectiveParams) {
        sessionStorage.removeItem(getStateKey());
        return null;
      }

      return parsed;
    } catch (error) {
      console.error("Failed to load products state:", error);
      return null;
    }
  }, [buildEffectiveParams, getStateKey]);

  const clearCurrentState = useCallback(() => {
    try {
      sessionStorage.removeItem(getStateKey());
    } catch (error) {
      console.error("Failed to clear products state:", error);
    }
  }, [getStateKey]);

  // Build API URL with current search parameters
  const buildApiUrl = useCallback((page = 1) => {
    const params = buildEffectiveParams();
    params.set('page', page.toString());
    params.set('limit', limit.toString());

    return `/api/productcounter?${params.toString()}`;
  }, [buildEffectiveParams, limit]);

  const requestProductsPage = useCallback(async (page = 1) => {
    const apiUrl = buildApiUrl(page);
    const response = await fetch(apiUrl, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }, [buildApiUrl]);

  // Fetch products function with parameter-aware API calls
  const fetchProducts = useCallback(async (page = 1, append = false) => {
    try {
      if (!append) setLoading(true);
      setIsLoadingMore(append);
      setError(null);

      const data = await requestProductsPage(page);
      const fetchedProducts = Array.isArray(data.products) ? data.products : [];
      const nextProducts = append
        ? [...(Array.isArray(products) ? products : []), ...fetchedProducts]
        : fetchedProducts;

      if (append) {
        setProducts(nextProducts);
      } else {
        setProducts(fetchedProducts);
      }

      const nextPage = data.pagination?.currentPage || page;
      const nextHasMore = data.pagination?.hasMore ?? page < (data.pagination?.totalPages || 0);
      const nextTotalCount = data.pagination?.totalCount ?? null;

      setTotalCount(nextTotalCount);
      setCurrentPage(nextPage);
      setHasMore(nextHasMore);
      saveState({
        currentPage: nextPage,
        hasMore: nextHasMore,
        totalCount: nextTotalCount,
      });
    } catch (error) {
      console.error("Fetch products error:", error);
      setError(error.message);
      if (!append) {
        setProducts([]);
        setHasMore(false);
        setTotalCount(null);
      }
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [products, requestProductsPage, saveState]);

  // Reset state when URL parameters change
  useEffect(() => {
    const newParams = buildEffectiveParams().toString();
    if (currentParams !== newParams && isInitialized) {
      // Parameters changed, reset everything
      setProducts([]);
      setCurrentPage(1);
      setHasMore(true);
      setError(null);
      setTotalCount(null);
      setCurrentParams(newParams);
      clearCurrentState();

      // Fetch new data immediately
      fetchProducts(1, false);
    } else if (!isInitialized) {
      setCurrentParams(newParams);
    }
  }, [buildEffectiveParams, currentParams, isInitialized, fetchProducts, clearCurrentState]);

  // Intersection Observer for infinite scroll
  const lastProductElementRef = useCallback((node) => {
    if (loading || isLoadingMore) return;
    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !error) {
        fetchProducts(currentPage + 1, true);
      }
    }, {
      threshold: 0.1,
      rootMargin: "100px",
    });

    if (node) observer.current.observe(node);
  }, [loading, isLoadingMore, hasMore, currentPage, fetchProducts, error]);

  // Load initial products and restore scroll/page state with fresh data.
  useEffect(() => {
    const initializeProducts = async () => {
      setIsInitialized(true);
      setLoading(true);
      setError(null);
      scrollRestorationAttempted.current = false;

      try {
        const cachedState = loadState();
        const targetPage = Math.max(1, Number(cachedState?.currentPage || 1));
        let mergedProducts = initialProducts;
        let latestPagination = initialPagination;

        if (targetPage > 1) {
          mergedProducts = [];

          for (let page = 1; page <= targetPage; page += 1) {
            const data = await requestProductsPage(page);
            const pageProducts = Array.isArray(data.products) ? data.products : [];
            mergedProducts = [...mergedProducts, ...pageProducts];
            latestPagination = data.pagination ?? latestPagination;

            if (!(data.pagination?.hasMore ?? false) && page >= (data.pagination?.currentPage || page)) {
              break;
            }
          }
        }

        setProducts(mergedProducts);
        setCurrentPage(latestPagination?.currentPage || 1);
        setHasMore(latestPagination?.hasMore ?? false);
        setTotalCount(latestPagination?.totalCount ?? null);

        if (cachedState?.scrollPosition > 100) {
          setTimeout(() => {
            if (!scrollRestorationAttempted.current) {
              scrollRestorationAttempted.current = true;
              window.scrollTo({ top: cachedState.scrollPosition, behavior: "instant" });
            }
          }, 250);
        }
      } catch (error) {
        console.error("Initialize products error:", error);
        setError(error.message);
        setProducts(initialProducts);
        setHasMore(false);
        setTotalCount(initialPagination?.totalCount ?? null);
      } finally {
        setLoading(false);
        setIsLoadingMore(false);
      }
    };

    if (!isInitialized) {
      initializeProducts();
    }
  }, [initialPagination, initialProducts, isInitialized, loadState, requestProductsPage]);

  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    const handleScroll = () => {
      saveState({
        currentPage,
        hasMore,
        totalCount,
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isInitialized, currentPage, hasMore, totalCount, saveState]);

  // Handle filter changes
  const handleFiltersChange = useCallback(() => {
    // Scroll to top when filters change
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Get the addProduct function from CartContext
  const { addProduct } = useContext(CartContext) || {};

  return (
    <Layout>
      <section className="sf-container pt-2">
        <h1 className={pageTitle ? "sf-title text-3xl md:text-4xl" : "sr-only"}>{resolvedPageTitle}</h1>
        {pageDescription ? <p className="sf-subtitle mt-3 max-w-4xl">{pageDescription}</p> : null}
      </section>
      {/* Filter and Sort Bar */}
      <FilterSortBar
        categories={categories}
        brands={brands}
        totalCount={totalCount}
        onFiltersChange={handleFiltersChange}
        lockedBrandSlug={forcedBrandSlug}
        lockedCategorySlug={forcedCategorySlug}
      />

      {/* Category and Brand Sliders */}
      <FilterSliders
        categories={categories}
        brands={brands}
        lockedBrandSlug={forcedBrandSlug}
        lockedCategorySlug={forcedCategorySlug}
      />
      <SearchBar />

      {/* Loading State */}
      {loading && products.length === 0 && (
        <ProductGridSkeleton />
      )}

      {/* Products Grid */}
      {Array.isArray(products) && products.length > 0 && (
        <div className="sf-container mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">
          {products?.map((product, index) => (
            <div
              key={`${product._id}-${index}`}
              className="sf-card relative overflow-hidden p-3"
              data-product-item
              ref={products.length === index + 1 ? lastProductElementRef : null}
            >
              <Link href={`/products/${product.slug}`}>
                <div className="sf-image-frame flex h-[13rem] items-center justify-center p-3 lg:h-[14rem] xl:h-[14rem] 2xl:h-[18rem]">
                <Image
                    src={product?.images[0]}
                    height={600}
                    width={600}
                    alt={product.title}
                    className="h-full w-full object-contain"
                    sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw"
                    data-product-image
                />
              </div>
              </Link>
              <Link href={`/products/${product.slug}`}>
                <h2 className="mt-4 line-clamp-2 text-sm font-semibold text-slate-900 transition-all duration-300 hover:text-teal-700 lg:text-base">
                  {t("prodt", {
                    name: product.title,
                    namear:
                      product.title_ar?.length > 2
                        ? product.title_ar
                        : product.title,
                  })}
                </h2>
              </Link>
              {product.OldPrice && (
                <span className="mt-2 block text-sm font-medium text-orange-600 line-through lg:text-base">
                  {insertDot(product.OldPrice)}
                  {t("da")}
                  </span>
                )}
              <span className="mt-1 block text-sm font-bold text-teal-700 lg:text-lg">
                {insertDot(product.price)}
                {t("da")}
              </span>
              <p
                className={`pb-12 pt-2 text-xs font-medium lg:text-sm ${
                  product.stock > 0
                    ? "text-green-600"
                    : "text-red-600"
                }`}
              >
                  {product.inStock ? t("es") : t("ns")}
              </p>
              {product.stock > 0 && addProduct && (
                <div className="w-full flex pb-2 justify-center px-1 absolute bottom-1 my-1.5">
                  <button
                    onClick={() => addProduct(product._id, product)}
                    className="sf-button w-10/12 py-2"
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
              )}
              <div className="absolute bottom-2 left-3 right-3 h-px bg-slate-200" />
            </div>
          ))}
        </div>
      )}

      {/* Loading More Indicator */}
      {isLoadingMore && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
          <span className="ml-2 text-slate-600">{t("LoadingMore")}</span>
        </div>
      )}

      {/* No More Products */}
      {!hasMore && Array.isArray(products) && products.length > 0 && !isLoadingMore && (
        <div className="py-8 text-center text-slate-500">
          <p>{t("noMoreProducts")}</p>
          {totalCount != null ? (
            <p className="mt-2 text-sm">Total: {totalCount} products</p>
          ) : null}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="py-8 text-center">
          <div className="mx-auto max-w-md rounded-[1.5rem] border border-red-200 bg-red-50 p-4">
            <p className="text-red-700 mb-2">Error: {error}</p>
            <button
              onClick={() => fetchProducts(currentPage + 1, true)}
              className="rounded-full bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700"
            >
              {t("retry")}
            </button>
          </div>
        </div>
      )}

      {/* No Products */}
      {(!Array.isArray(products) || products.length === 0) && !loading && !error && isInitialized && (
        <div className="sf-container py-16 text-center">
          <svg className="mx-auto mb-4 h-24 w-24 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.463-.64-6.314-1.76M12 9V6.25A2.25 2.25 0 009.75 4h-4.5A2.25 2.25 0 003 6.25V9m6 0v3m0-3h6m-6 3v3"/>
          </svg>
          <h3 className="mb-2 text-xl font-semibold text-slate-700">
            {t("np") || "No products found."}
          </h3>
          <p className="mb-4 text-slate-500">
            {t("Try adjusting your filters or search terms")}
          </p>
          <button
            onClick={() => {
              clearCurrentState();
              window.location.href = window.location.pathname;
            }}
            className="bg-teal-600 text-white px-6 py-2 rounded-lg hover:bg-teal-700 transition-colors"
          >
            {t("rtr")}
          </button>
        </div>
      )}

      {/* Back to Top Button */}
      {products.length > 20 && (
        <div className="fixed bottom-20 right-4 z-50">
          <button
            onClick={() => {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="bg-teal-600 text-white p-3 rounded-full shadow-lg hover:bg-teal-700 transition-colors"
            aria-label="Back to top"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 10l7-7m0 0l7 7m-7-7v18"
              />
            </svg>
          </button>
        </div>
      )}

    </Layout>
  );
}
