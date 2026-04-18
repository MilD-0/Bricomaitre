// components/SearchBar.js
"use client";
import { useState, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

export default function SearchBar() {
  const t = useTranslations("common");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [text, setText] = useState(searchParams.get("search") || "");

  const updateURL = useCallback(
    (query) => {
      const params = new URLSearchParams(searchParams.toString());

      if (query && query.trim() !== "") {
        params.set("search", query.trim());
      } else {
        params.delete("search");
      }

      params.delete("page"); // reset pagination when searching
      const newURL = `${pathname}?${params.toString()}`;
      router.push(newURL);
    },
    [searchParams, pathname, router]
  );

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      updateURL(text);
    }
  };

  const handleInputChange = (e) => {
    setText(e.target.value);
  };

  const performSearch = () => {
    updateURL(text);
  };

  return (
    <div className="md:hidden mx-auto flex flex-row mt-6 mx-2 ms-4">
      <input
        onKeyDown={handleKeyDown}
        spellCheck="false"
        placeholder={t("srch") + "..."}
        className={
          (pathname.includes("/cart") ? "bg-gray-100" : "bg-white") +
          " focus:outline-none text-sm font-semibold ps-2 md:ps-3 rounded-xl overflow-x-clip w-9/12 ring-2 ring-black lg:text-md"
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
}
