"use client";
import { useEffect, useRef, useState } from "react";
import { useDebounce } from "use-debounce";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { usePathname, useRouter } from "@/i18n/navigation";

const Search = ({ setResults }: any) => {
  const t = useTranslations("Layout");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialRender = useRef(true);
  const search = searchParams.get("search");
  const lmt = searchParams.get("limit");
  const stk = searchParams.get("instock");
  const [previousQuery, setPreviousQuery] = useState("");

  const sortby = searchParams.get("sortby");
  const brand = searchParams.get("brand");
  const category = searchParams.get("category");
  const [text, setText] = useState(search || "");
  const [query] = useDebounce(text, 500);

  useEffect(() => {
    if (query.length >= 2 && pathname !== "/products") {
      const fetchProducts = async () => {
        const response = await fetch("/api/products4?limit=4&search=" + query);
        const results = await response.json();
        setResults(results);
      };

      fetchProducts();
    } else {
      setResults([]);
    }
  }, [query, pathname, setResults]);

  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }

    if (pathname === "/products" && !query && previousQuery !== "") {
      router.push(
        `/products?${lmt ? `&limit=${lmt}` : ""}${
          brand ? `&brand=${brand}` : ""
        }${category ? `&category=${category}` : ""}${
          sortby ? `&sortby=${sortby}` : ""
        }${stk === "true" ? `&instock=${stk}` : ""}&#products`
      );
    } else if (pathname === "/products" && query) {
      router.push(
        `/products?search=${query}${lmt ? `&limit=${lmt}` : ""}${
          brand ? `&brand=${brand}` : ""
        }${category ? `&category=${category}` : ""}${
          sortby ? `&sortby=${sortby}` : ""
        }${stk === "true" ? `&instock=${stk}` : ""}&#products`
      );
      setPreviousQuery(query);
    }
  }, [
    query,
    router,
    pathname,
    lmt,
    brand,
    category,
    sortby,
    previousQuery,
    stk,
  ]);
  const searchButton = () => {
    router.push(`/products?search=${query}&#products`);
  };
  const isProductsListPage = pathname === "/products";
  return (
    <div className={isProductsListPage ? "relative hidden md:block" : "relative"}>
      <input
        onKeyDown={(e) => (e.key === "Enter" ? searchButton() : null)}
        spellCheck="false"
        placeholder={t("srch") + "..."}
        className="sf-input h-11 py-2.5 pr-14 md:h-10"
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        onClick={searchButton}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-teal-700 p-1.5 text-white transition-colors duration-200 hover:bg-teal-600"
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
export default Search;
