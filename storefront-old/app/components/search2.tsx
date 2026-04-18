"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useDebounce } from "use-debounce";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

const Search2 = ({ setResults, onSearchProducts }: any) => {
  const t = useTranslations("Layout");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialRender = useRef(true);
  const search = searchParams.get("search");

  const [text, setText] = useState(search || "");
  const [query] = useDebounce(text, 300);
  const isProductsPage = pathname === "/products";


  const handleProductsPageSearch = useCallback(
    async (searchTerm: string) => {
      if (!onSearchProducts) return;


      onSearchProducts(searchTerm);
    },
    [onSearchProducts]
  );


  const handleOtherPageSearch = useCallback(
    async (searchTerm: string) => {
      if (searchTerm.length >= 2) {
        try {
          const response = await fetch(
            `/api/products3?limit=4&search=${encodeURIComponent(searchTerm)}`
          );
          if (response.ok) {
            const results = await response.json();
            setResults(results);
          }
        } catch (error) {
          console.error("Search error:", error);
          setResults([]);
        }
      } else {
        setResults([]);
      }
    },
    [setResults]
  );


  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }

    if (isProductsPage) {

      handleProductsPageSearch(query);
    } else {

      handleOtherPageSearch(query);
    }
  }, [query, isProductsPage, handleProductsPageSearch, handleOtherPageSearch]);


  const performSearch = useCallback(() => {
    if (isProductsPage) {

      handleProductsPageSearch(query);
    } else {

      const searchUrl = query
        ? `/products?search=${encodeURIComponent(query)}#products`
        : "/products#products";
      router.push(searchUrl);
    }
  }, [isProductsPage, query, router, handleProductsPageSearch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        performSearch();
      }
    },
    [performSearch]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setText(e.target.value);
    },
    []
  );

  return (
    <div className="md:hidden  flex flex-row mt-6 mx-2 ms-4">
      <input
        onKeyDown={handleKeyDown}
        spellCheck="false"
        placeholder={t("srch") + "..."}
        className={
          (pathname.includes("/cart") ? "bg-gray-100" : "bg-white") +
          " focus:outline-none text-sm font-semibold ps-2 md:ps-3 rounded-xl overflow-x-clip  w-9/12 ring-2 ring-black lg:text-md"
        }
        type="search"
        value={text}
        onChange={handleInputChange}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
      />
      <button
        onClick={performSearch}
        className="bg-black py-1 align-middle bott mx-1 px-2 border-black text-white float-end rounded-r-xl"
        type="button"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
          className="size-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
          />
        </svg>
      </button>
    </div>
  );
};

export default Search2;
