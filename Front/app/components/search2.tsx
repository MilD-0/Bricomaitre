"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useDebounce } from "use-debounce";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

const Search2 = ({ setResults }: any) => {
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
    <div className="md:hidden mx-2">
      <input
        onKeyDown={(e) => (e.key === "Enter" ? searchButton() : null)}
        spellCheck="false"
        placeholder={t("srch") + "..."}
        className={
          (pathname.includes("/cart") ? "bg-gray-100" : "bg-white") +
          "   focus:outline-none  text-sm  font-semibold ps-2 mt-6 md:ps-3 rounded overflow-x-clip w-full ring-2 ring-black lg:text-md"
        }
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  );
};
export default Search2;
