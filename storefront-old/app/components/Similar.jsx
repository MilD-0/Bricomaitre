"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { CartContext } from "./cartContext";
import { useContext } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Category({ categoryid }) {
  const t = useTranslations("common");
  const { addProduct } = useContext(CartContext);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("");
  const [isLoadingMore, setIsLoadingMore] = useState(false);


  const [isShowingBrandProducts, setIsShowingBrandProducts] = useState(false);
  const [brandPage, setBrandPage] = useState(1);
  const [currentProductBrands, setCurrentProductBrands] = useState(new Set());

  const pathname = usePathname();
  const [childCategory, setChildCategory] = useState("");
  const observer = useRef();


  const lastProductElementRef = useCallback(
    (node) => {
      if (isLoadingMore) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          if (isShowingBrandProducts) {
            setBrandPage((prevPage) => prevPage + 1);
          } else {
            setPage((prevPage) => prevPage + 1);
          }
        }
      });
      if (node) observer.current.observe(node);
    },
    [isLoadingMore, hasMore, isShowingBrandProducts]
  );

  const fetchCategoryProducts = async (pageNum = 1, reset = false) => {
    try {
      setIsLoadingMore(true);
      const response = await fetch(
        `/api/track?&category=${categoryid || ""}&childCategory=${
          childCategory || ""
        }&page=${pageNum}&limit=10`
      );
      const data = await response.json();

      if (reset) {
        setProducts(data.products);

        const brands = new Set();
        data.products.forEach((product) => {
          if (product.brand && product.brand._id) {
            brands.add(product.brand._id);
          }
        });
        setCurrentProductBrands(brands);
      } else {
        setProducts((prev) => [...prev, ...data.products]);

        data.products.forEach((product) => {
          if (product.brand && product.brand._id) {
            setCurrentProductBrands(
              (prev) => new Set([...prev, product.brand._id])
            );
          }
        });
      }


      const categoryHasMore = data.pagination?.hasMore || false;

      if (
        !categoryHasMore &&
        !isShowingBrandProducts &&
        currentProductBrands.size > 0
      ) {

        setIsShowingBrandProducts(true);
        setBrandPage(1);
        setHasMore(true);

        setTimeout(() => fetchBrandProducts(1, false), 100);
      } else {
        setHasMore(categoryHasMore);
      }
    } catch (error) {
      console.error(error);
      if (!isShowingBrandProducts && currentProductBrands.size > 0) {

        setIsShowingBrandProducts(true);
        setBrandPage(1);
        fetchBrandProducts(1, false);
      } else {
        setHasMore(false);
      }
    } finally {
      setIsLoadingMore(false);
    }
  };

  const fetchBrandProducts = async (pageNum = 1, reset = false) => {
    if (currentProductBrands.size === 0) {
      setHasMore(false);
      setIsLoadingMore(false);
      return;
    }

    try {
      setIsLoadingMore(true);

      const brandsArray = Array.from(currentProductBrands);
      const randomBrand =
        brandsArray[Math.floor(Math.random() * brandsArray.length)];

      const response = await fetch(
        `/api/track?brand=${randomBrand}&page=${pageNum}&limit=10`
      );
      const data = await response.json();

      if (data.products && data.products.length > 0) {

        const existingProductIds = new Set(products.map((p) => p._id));
        const newProducts = data.products.filter(
          (p) => !existingProductIds.has(p._id)
        );

        if (newProducts.length > 0) {
          setProducts((prev) => [...prev, ...newProducts]);
          setHasMore(data.pagination?.hasMore || false);
        } else {

          if (brandsArray.length > 1) {
            const remainingBrands = brandsArray.filter(
              (brand) => brand !== randomBrand
            );
            setCurrentProductBrands(new Set(remainingBrands));

            setTimeout(() => fetchBrandProducts(pageNum, false), 100);
          } else {
            setHasMore(false);
          }
        }
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error(error);
      setHasMore(false);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const fetchCategory = async () => {
    try {
      const response = await fetch("/api/category?id=" + categoryid);
      const data0 = await response.json();
      setCategory(data0);
    } catch (error) {
      console.error(error);
    }
  };


  useEffect(() => {
    setLoading(true);
    setPage(1);
    setBrandPage(1);
    setIsShowingBrandProducts(false);
    setCurrentProductBrands(new Set());
    fetchCategoryProducts(1, true);
    fetchCategory();
    setLoading(false);
  }, [categoryid, childCategory]);

  useEffect(() => {
    if (page > 1 && !isShowingBrandProducts) {
      fetchCategoryProducts(page, false);
    }
  }, [page]);


  useEffect(() => {
    if (brandPage > 1 && isShowingBrandProducts) {
      fetchBrandProducts(brandPage, false);
    }
  }, [brandPage]);

  if (loading && products.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8  mb-2"></div>
        <p>{t("Loadingsearch")}</p>
      </div>
    );
  }

  if (products.length < 4) {
    return null;
  }

  if (!products || !products[0]?.images[0]) {
    return null;
  }

  return (
    <div className="overflow-hidden">
      {pathname.includes("/products") || pathname.includes("/landing") ? (
        <h1 className="lg:text-3xl lg:font-medium lg:mt-16 text-xl font-bold mt-16">
          {isShowingBrandProducts ? t("simps") + ":" : t("simps") + ":"}
        </h1>
      ) : (
        <h1 className="font-semibold text-3xl lg:text-4xl my-8 text-center w-full">
          {t("cat")}{" "}
          {t("catn", {
            catn: category?.name,
            catnar:
              category?.name_ar?.length > 2
                ? category?.name_ar
                : category?.name,
          })}
        </h1>
      )}
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
      {/* Infinite Scroll Grid */}
      <div className=" mt-3  px-2">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 py-4">
          {products.map((product, index) => (
            <div
              key={`${product._id}-${index}`}
              ref={index === products.length - 1 ? lastProductElementRef : null}
              className="bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-lg transition-shadow duration-200"
            >
              <Link href={"/products/" + product._id}>
                <div className="rounded-2xl overflow-hidden flex h-[10rem] lg:h-[10rem] xl:h-[12rem] 2xl:h-[16rem] p-2 relative bg-white">
                  <Image
                    src={product.images[0]}
                    fill="cover"
                    alt="product-img"
                    className="w-full h-full object-contain hover:scale-125 transform transition duration-300"
                    loading="lazy"
                  />
                </div>
              </Link>

              <Link target="_blank" href={"/products/" + product._id}>
                <h1 className="font-semibold text-sm text-ellipsis text-wrap hover:text-teal-600 transition-colors duration-300 text-center line-clamp-2 lg:text-base px-2">
                  {t("prodt", {
                    name: product.title,
                    namear:
                      product.title_ar?.length > 2
                        ? product.title_ar
                        : product.title,
                  })}
                </h1>
              </Link>

              <div className="flex px-8 items-center justify-center gap-4 pb-4">
                <h1 className="font-semibold md:text-xl text-emerald-700">
                  {product.price}
                  {t("da")}
                </h1>

                <button
                  onClick={() => {
                    product.stock > 0 && addProduct(product._id);
                  }}
                  className="bg-teal-600 text-white py-1 text-center w-1/3 rounded-full hover:bg-teal-500 transition-colors duration-200 flex px-3 flex-row"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                    className="mx-auto p-0 m-0 size-7 md:size-6"
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

        {/* Loading indicator */}
        {isLoadingMore && (
          <div className="text-center py-4">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
            <p className="mt-2 text-gray-600">{t("LoadingMore")}</p>
          </div>
        )}

        {/* End of results indicator */}
        {!hasMore && products.length > 0 && (
          <div className="text-center py-4 text-gray-500">
            <p>{t("noMoreProducts")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
