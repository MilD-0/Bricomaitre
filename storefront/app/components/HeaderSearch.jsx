"use client";

import { useEffect, useRef, useState } from "react";
import { useDebounce } from "use-debounce";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";

export default function HeaderSearch({ setResults, setIsSearching }) {
  const t = useTranslations("Layout");
  const router = useRouter();
  const [text, setText] = useState("");
  const [query] = useDebounce(text.trim(), 150);
  const lastCompletedQueryRef = useRef("");

  useEffect(() => {
    const controller = new AbortController();

    const fetchResults = async () => {
      if (query.length < 2) {
        lastCompletedQueryRef.current = "";
        setResults([]);
        setIsSearching(false);
        return;
      }

      if (lastCompletedQueryRef.current === query) {
        setIsSearching(false);
        return;
      }

      try {
        setIsSearching(true);
        const response = await fetch(`/api/products4?limit=4&search=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const results = await response.json();

        lastCompletedQueryRef.current = query;
        setResults(results);
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error(error);
          lastCompletedQueryRef.current = "";
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    };

    void fetchResults();

    return () => {
      controller.abort();
    };
  }, [query, setIsSearching, setResults]);

  const searchButton = () => {
    router.push(query ? `/products?search=${encodeURIComponent(query)}#products` : "/products#products");
  };

  return (
    <div className="relative">
      <input
        onKeyDown={(e) => (e.key === "Enter" ? searchButton() : null)}
        spellCheck="false"
        placeholder={t("srch") + "..."}
        className="sf-input h-11 py-2.5 pr-14 md:h-10"
        type="search"
        value={text}
        onChange={(e) => {
          lastCompletedQueryRef.current = "";
          setText(e.target.value);
        }}
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
}
