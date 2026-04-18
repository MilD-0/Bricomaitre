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
} from "react";
import { useSearchParams, useRouter } from "next/navigation";

import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

import { CartContext } from "../components/cartContext";
import Link from "next/link";
import { useTranslations } from "next-intl";
import FilterSortBar from "../components/FilterSortBar";
import FilterSliders from "../components/FilterSliders";
import { useFilterData } from "../hooks/useFilterData";

// Constants for state persistence
const PRODUCTS_CACHE_PREFIX = 'products_infinite_scroll_cache';
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes

export default function Products() {
  const t = useTranslations("common");
  const searchParams = useSearchParams();

  // Filter data
  const { categories, brands, loading: filterDataLoading, error: filterDataError } = useFilterData();

  function insertDot(num) {
    let numStr = num.toString();
    if (numStr.length >= 4) {
      return numStr.slice(0, -3) + "." + numStr.slice(-3);
    }
    return numStr;
  }

  const observer = useRef();
  const scrollRestorationAttempted = useRef(false);
  const justLoadedFromCache = useRef(false);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentParams, setCurrentParams] = useState('');
  const [totalCount, setTotalCount] = useState(0);

  const limit = 20;

  // Generate cache key based on URL parameters
  const generateCacheKey = useCallback(() => {
    const params = new URLSearchParams();

    // Include all relevant search parameters that affect the results
    const relevantParams = ['search', 'category', 'childCategory', 'brand', 'instock', 'sortby'];
    relevantParams.forEach(param => {
      const value = searchParams.get(param);
      if (value) {
        params.set(param, value);
      }
    });

    // Sort parameters to ensure consistent cache key
    params.sort();
    const paramsString = params.toString();
    return `${PRODUCTS_CACHE_PREFIX}_${paramsString}`;
  }, [searchParams]);

  // Build API URL with current search parameters
  const buildApiUrl = useCallback((page = 1) => {
    const params = new URLSearchParams();
    params.set('page', page.toString());
    params.set('limit', limit.toString());

    // Add all current search parameters
    searchParams.forEach((value, key) => {
      if (key !== 'page' && key !== 'limit') {
        params.set(key, value);
      }
    });

    return `/api/productcounter?${params.toString()}`;
  }, [searchParams, limit]);

  // State persistence functions with parameter-aware caching
  const saveStateToCache = useCallback((stateData, scrollY = null) => {
    try {
      // Use provided scrollY if available, otherwise use current scroll position
      const currentScrollY = scrollY !== null ? scrollY : window.scrollY;
      const cacheKey = generateCacheKey();
      const cacheData = {
        ...stateData,
        timestamp: Date.now(),
        scrollPosition: currentScrollY,
        params: searchParams.toString()
      };

      sessionStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (error) {
      console.error('Failed to save state to cache:', error);
    }
  }, [generateCacheKey, searchParams]);

  const loadStateFromCache = useCallback(() => {
    try {
      const cacheKey = generateCacheKey();
      const cachedData = sessionStorage.getItem(cacheKey);
      if (!cachedData) return null;

      const parsedData = JSON.parse(cachedData);

      // Check if cache is still valid
      if (Date.now() - parsedData.timestamp > CACHE_EXPIRY) {
        sessionStorage.removeItem(cacheKey);
        return null;
      }

      // Verify that cached params match current params
      if (parsedData.params !== searchParams.toString()) {
        sessionStorage.removeItem(cacheKey);
        return null;
      }

      return parsedData;
    } catch (error) {
      console.error('Failed to load state from cache:', error);
      return null;
    }
  }, [generateCacheKey, searchParams]);

  const clearCache = useCallback(() => {
    try {
      // Clear all caches with this prefix
      const keys = Object.keys(sessionStorage);
      keys.forEach(key => {
        if (key.startsWith(PRODUCTS_CACHE_PREFIX)) {
          sessionStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }, []);

  // Clear specific cache when parameters change
  const clearCurrentCache = useCallback(() => {
    try {
      const cacheKey = generateCacheKey();
      sessionStorage.removeItem(cacheKey);
    } catch (error) {
      console.error('Failed to clear current cache:', error);
    }
  }, [generateCacheKey]);

  // Robust scroll restoration function
  const restoreScrollPosition = useCallback((targetPosition) => {
    if (scrollRestorationAttempted.current || targetPosition <= 100) return;

    scrollRestorationAttempted.current = true;

    const currentHeight = document.documentElement.scrollHeight;
    const windowHeight = window.innerHeight;
    const maxScrollPosition = currentHeight - windowHeight;
    const actualTarget = Math.min(targetPosition, maxScrollPosition);

    try {
      window.scrollTo({
        top: actualTarget,
        behavior: 'instant'
      });

      // Verify scroll worked after a short delay
      setTimeout(() => {
        const newPosition = window.scrollY;
        if (Math.abs(newPosition - actualTarget) > 50) {
          window.scrollTo({
            top: actualTarget,
            behavior: 'smooth'
          });
        }
      }, 100);
    } catch (error) {
      console.error('Scroll restoration error:', error);
    }
  }, []);

  // Fetch products function with parameter-aware API calls
  const fetchProducts = useCallback(async (page = 1, append = false) => {
    try {
      if (!append) setLoading(true);
      setIsLoadingMore(append);
      setError(null);

      const apiUrl = buildApiUrl(page);
      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const fetchedProducts = Array.isArray(data.products) ? data.products : [];

      if (append) {
        setProducts(prev => {
          const previousProducts = Array.isArray(prev) ? prev : [];
          return [...previousProducts, ...fetchedProducts];
        });
      } else {
        setProducts(fetchedProducts);
        // Update total count only on fresh loads
        setTotalCount(data.pagination?.totalCount || 0);
      }

      setCurrentPage(data.pagination?.currentPage || page);
      setHasMore(data.pagination?.hasMore ?? page < (data.pagination?.totalPages || 0));

      // Save state to cache after successful fetch
      const currentProducts = append ? [...(products || []), ...fetchedProducts] : fetchedProducts;
      const stateToCache = {
        products: currentProducts,
        currentPage: data.pagination?.currentPage || page,
        hasMore: data.pagination?.hasMore ?? page < (data.pagination?.totalPages || 0),
        totalPages: data.pagination?.totalPages || 0,
        totalCount: data.pagination?.totalCount || 0
      };
      saveStateToCache(stateToCache, window.scrollY);
    } catch (error) {
      console.error("Fetch products error:", error);
      setError(error.message);
      if (!append) {
        setProducts([]);
        setHasMore(false);
        setTotalCount(0);
      }
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [buildApiUrl, products, saveStateToCache]);

  // Reset state when URL parameters change
  useEffect(() => {
    const newParams = searchParams.toString();
    if (currentParams !== newParams && isInitialized) {
      // Parameters changed, reset everything
      setProducts([]);
      setCurrentPage(1);
      setHasMore(true);
      setError(null);
      setTotalCount(0);
      setCurrentParams(newParams);
      scrollRestorationAttempted.current = false; // Reset scroll restoration flag

      // Fetch new data immediately
      fetchProducts(1, false);
    } else if (!isInitialized) {
      setCurrentParams(newParams);
    }
  }, [searchParams, currentParams, isInitialized, fetchProducts]);

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

  // Load initial products with state restoration
  useEffect(() => {
    const initializeProducts = async () => {
      scrollRestorationAttempted.current = false;

      // Try to load from cache first
      const cachedState = loadStateFromCache();

      if (cachedState && Array.isArray(cachedState.products) && cachedState.products.length > 0) {
        justLoadedFromCache.current = true;

        // Restore from cache
        setProducts(cachedState.products);
        setCurrentPage(cachedState.currentPage || 1);
        setHasMore(cachedState.hasMore ?? true);
        setTotalCount(cachedState.totalCount || 0);
        setIsInitialized(true);
      } else {
        justLoadedFromCache.current = false;
        // Fresh load
        setIsInitialized(true);
        await fetchProducts(1);
      }
    };

    // Only initialize once when component mounts
    if (!isInitialized) {
      initializeProducts();
    }
  }, [isInitialized, loadStateFromCache, fetchProducts]);

  // Handle scroll restoration after everything is rendered
  useEffect(() => {
    if (
      !scrollRestorationAttempted.current &&
      isInitialized &&
      !filterDataLoading &&
      !loading &&
      Array.isArray(products) &&
      products.length > 0
    ) {
      const cachedState = loadStateFromCache();
      if (cachedState?.scrollPosition && cachedState.scrollPosition > 100) {
        setTimeout(() => {
          restoreScrollPosition(cachedState.scrollPosition);
        }, 500);
      }
    }
  }, [
    isInitialized,
    filterDataLoading,
    loading,
    products,
    loadStateFromCache,
    restoreScrollPosition
  ]);

  // Save state when products change and set up continuous scroll position tracking
  useEffect(() => {
    if (!isInitialized || !Array.isArray(products) || products.length === 0) return;

    // Don't save immediately after loading from cache
    if (justLoadedFromCache.current) {
      justLoadedFromCache.current = false;
      return;
    }

    // Save state immediately when products change
    const currentState = {
      products,
      currentPage,
      hasMore,
      totalCount
    };
    // Capture current scroll position when saving after products change
    saveStateToCache(currentState, window.scrollY);

    // Set up a scroll listener to continuously update the cache with current scroll position
    let scrollTimeout;
    const handleScroll = () => {
      // Clear previous timeout
      clearTimeout(scrollTimeout);

      // Update cache immediately with the current scroll position
      const updatedState = {
        products,
        currentPage,
        hasMore,
        totalCount
      };
      saveStateToCache(updatedState, window.scrollY);

      // Also set a timeout to update the cache after scroll stops
      scrollTimeout = setTimeout(() => {
        const finalState = {
          products,
          currentPage,
          hasMore,
          totalCount
        };
        saveStateToCache(finalState, window.scrollY);
      }, 300);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [products, currentPage, hasMore, totalCount, saveStateToCache, isInitialized]);

  // Handle filter changes
  const handleFiltersChange = useCallback(() => {
    // Scroll to top when filters change
    scrollRestorationAttempted.current = true; // Prevent scroll restoration
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const LoadingSkeleton = () => (
    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-5 md:w-[90%] mx-auto">
      {[...Array(10)].map((_, index) => (
        <div key={index} className="animate-pulse">
          <div className="aspect-square w-full flex justify-center items-center bg-gray-300 rounded-xl p-2 mb-2">
            <svg
              className="w-10 h-10 text-gray-200"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              fill="currentColor"
              viewBox="0 0 20 18"
            >
              <path d="M18 0H2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2Zm-5.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm4.376 10.481A1 1 0 0 1 16 15H4a1 1 0 0 1-.895-1.447l3.5-7A1 1 0 0 1 7.468 6a.965.965 0 0 1 .9.5l2.775 4.757 1.546-1.887a1 1 0 0 1 1.618.1l2.541 4a1 1 0 0 1 .028 1.011Z" />
            </svg>
          </div>
          <div className="h-4 bg-gray-300 rounded-full mb-2"></div>
          <div className="h-4 bg-gray-300 rounded-full w-5/6 mb-2"></div>
          <div className="h-5 bg-gray-300 rounded-full w-24 mb-2"></div>
          <div className="h-3.5 bg-gray-300 rounded-full w-20"></div>
        </div>
      ))}
    </div>
  );

  // Get the addProduct function from CartContext
  const { addProduct } = useContext(CartContext) || {};

  if (filterDataLoading) {
    return (
      <Layout>
        <div className="flex justify-center items-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
          <span className="ml-2">{t("loadingFilters")}</span>
        </div>
      </Layout>
    );
  }

  if (filterDataError) {
    return (
      <Layout>
        <div className="text-center py-16">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-md mx-auto">
            <p className="text-red-700">{t("errorLoadingFilters", { error: filterDataError })}</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Filter and Sort Bar */}
      <FilterSortBar
        categories={categories}
        brands={brands}
        totalCount={totalCount}
        onFiltersChange={handleFiltersChange}
      />

      {/* Category and Brand Sliders */}
      <FilterSliders
        categories={categories}
        brands={brands}
      />
      <SearchBar />

      {/* Loading State */}
      {loading && products.length === 0 && (
        <LoadingSkeleton />
      )}

      {/* Products Grid */}
      {Array.isArray(products) && products.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 mt-4 xl:grid-cols-5 gap-3 p-5 md:w-[90%] mx-auto">
          {products?.map((product, index) => (
            <div
              key={`${product._id}-${index}`}
              className="rounded-lg relative p-1"
              data-product-item
              ref={products.length === index + 1 ? lastProductElementRef : null}
            >
              <Link href={"/products/" + product._id}>
                <div className="flex drop-shadow hover:drop-shadow-xl transition-all duration-500 h-[13rem] lg:h-[14rem] xl:h-[14rem] 2xl:h-[18rem] p-2 relative bg-white rounded-xl">
                <Image
                    src={product?.images[0]}
                    height={600}
                    width={600}
                    alt={product.title}
                    className="object-contain w-full h-full"
                    sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw"
                    data-product-image
                />
              </div>
              </Link>
              <Link href={"/products/" + product._id}>
                <h1 className="font-semibold hover:text-teal-700 transition-all duration-500 text-sm line-clamp-2 lg:text-base">
                  {t("prodt", {
                    name: product.title,
                    namear:
                      product.title_ar?.length > 2
                        ? product.title_ar
                        : product.title,
                  })}
                </h1>
              </Link>
              {product.OldPrice && (
                <span className="font-bold text-red-500 block line-through text-sm lg:text-lg">
                  {insertDot(product.OldPrice)}
                  {t("da")}
                  </span>
                )}
              <span className="font-bold text-teal-700 text-sm lg:text-lg">
                {insertDot(product.price)}
                {t("da")}
              </span>
              <p
                className={`text-xs font-medium mb-1 lg:text-sm pb-12 ${
                  product.stock > 0
                    ? product.stock > 5
                      ? "text-teal-700"
                      : "text-yellow-600"
                    : "text-red-600"
                }`}
              >
                {product.stock > 0
                  ? product.stock > 5
                    ? t("es")
                    : t("mq")
                  : t("ns")}
              </p>
              {product.stock > 0 && addProduct && (
                <div className="w-full flex pb-2 justify-center px-1 absolute bottom-1 my-1.5">
                  <button
                    onClick={() => addProduct(product._id)}
                    className="bg-teal-600 text-white py-1 text-center w-10/12 rounded-full hover:bg-teal-500 transition-colors duration-200 flex px-3 flex-row"
                    aria-label={`Add ${product.title} to cart`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="1.5"
                      stroke="currentColor"
                      className="size-6 mx-auto"
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
              <div className="border-b-2 justify-center mx-auto w-full h-2 rounded-lg border-gray-400 absolute bottom-1.5"></div>
            </div>
          ))}
        </div>
      )}

      {/* Loading More Indicator */}
      {isLoadingMore && (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
          <span className="ml-2 text-gray-600">{t("LoadingMore")}</span>
        </div>
      )}

      {/* No More Products */}
      {!hasMore && Array.isArray(products) && products.length > 0 && !isLoadingMore && (
        <div className="text-center py-8 text-gray-500">
          <p>{t("noMoreProducts")}</p>
          <p className="text-sm mt-2">Total: {products.length} products</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="text-center py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-md mx-auto">
            <p className="text-red-700 mb-2">Error: {error}</p>
            <button
              onClick={() => fetchProducts(currentPage + 1, true)}
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors"
            >
              {t("retry")}
            </button>
          </div>
        </div>
      )}

      {/* No Products */}
      {(!Array.isArray(products) || products.length === 0) && !loading && !error && isInitialized && (
        <div className="text-center py-16">
          <svg className="mx-auto h-24 w-24 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.463-.64-6.314-1.76M12 9V6.25A2.25 2.25 0 009.75 4h-4.5A2.25 2.25 0 003 6.25V9m6 0v3m0-3h6m-6 3v3"/>
          </svg>
          <h3 className="text-xl font-semibold text-gray-700 mb-2">
            {t("np") || "No products found."}
          </h3>
          <p className="text-gray-500 mb-4">
            {t("Try adjusting your filters or search terms")}
          </p>
          <button
            onClick={() => {
              clearCache();
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

      {/* Debug info - remove in production */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-4 left-4 bg-black bg-opacity-75 text-white p-2 rounded text-xs max-w-xs">
          <div>Page: {currentPage}</div>
          <div>Products: {Array.isArray(products) ? products.length : 0}</div>
          <div>Total: {totalCount}</div>
          <div>Has More: {hasMore ? 'Yes' : 'No'}</div>
          <div>Params: {searchParams.toString() || 'None'}</div>
          <div>Scroll Attempted: {scrollRestorationAttempted.current ? 'Yes' : 'No'}</div>
          <button
            onClick={() => {
              clearCache();
              scrollRestorationAttempted.current = false;
            }}
            className="mt-1 px-1 bg-red-500 rounded text-xs w-full"
          >
            Clear Cache
          </button>
        </div>
      )}

    </Layout>
  );
}