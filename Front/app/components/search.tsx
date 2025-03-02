"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useDebounce } from "use-debounce";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

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
        const response = await fetch("/api/products?limit=4&search=" + query);
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
  return (
    <div
      className={
        (pathname.includes("/products") && "hidden md:flex") +
        " mx-2 flex-row   float-start    text-start mt-2  rounded-full np border-solid border-gray-300 relative"
      }
    >
      <input
        onKeyDown={(e) => (e.key === "Enter" ? searchButton() : null)}
        spellCheck="false"
        placeholder={t("srch") + "..."}
        className={
          (pathname.includes("/cart") ? "bg-gray-100" : "bg-white") +
          "   focus:outline-none  text-sm  font-semibold ps-2  md:ps-3 rounded-full w-[77.4%] sm:w-[89%] md:w-[90%] lg:w-[92%] xl:w-[94%] 2xl:w-[95%] lg:text-md"
        }
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        onClick={searchButton}
        className={
          (pathname.includes("/products")
            ? "bg-transparent"
            : "bg-black border-2 border-solid ") +
          "align-middle bott mx-1 px-4  border-black  text-white  float-end  "
        }
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          className="size-5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
          />
        </svg>
      </button>
    </div>
  );
};
export default Search;
