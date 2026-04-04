// components/SearchBar.js
"use client";
import { useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { usePathname, useRouter } from "@/i18n/navigation";

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
    void trackAnalyticsEvent({
      eventName: "search",
      gaEventName: "search",
      searchTerm: text.trim() || null,
      pagePath: `${pathname}?${new URLSearchParams(searchParams.toString()).toString()}`,
      metadata: {
        query: text.trim(),
      },
      gaParams: {
        search_term: text.trim(),
      },
    });
    updateURL(text);
  };

  return (
    <div className="sf-container mt-5 md:hidden">
      <div className="flex items-center gap-2">
      <input
        onKeyDown={handleKeyDown}
        spellCheck="false"
        placeholder={t("srch") + "..."}
        className="sf-input"
        type="search"
        value={text}
        onChange={handleInputChange}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
      />
      <button
        onClick={performSearch}
        className="sf-button h-[46px] px-4"
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
    </div>
  );
}
