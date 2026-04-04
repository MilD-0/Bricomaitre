// FilterSortBar.js
"use client";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { usePathname, useRouter } from "@/i18n/navigation";

export default function FilterSortBar({
  categories = [],
  brands = [],
  totalCount = 0,
  onFiltersChange,
  lockedBrandSlug = "",
  lockedCategorySlug = "",
}) {
  const t = useTranslations("common");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState(0);

  // Get current values from URL
  const currentCategory = lockedCategorySlug || searchParams.get("category") || "";
  const currentChildCategory = searchParams.get("childCategory") || "";
  const currentBrand = lockedBrandSlug || searchParams.get("brand") || "";
  const currentInStock = searchParams.get("instock") || "";
  const currentSort = searchParams.get("sortby") || "";

  // Count active filters
  useEffect(() => {
    let count = 0;
    if (!lockedCategorySlug && currentCategory && currentCategory !== "tous") count++;
    if (currentChildCategory && currentChildCategory !== "tous") count++;
    if (!lockedBrandSlug && currentBrand && currentBrand !== "tous") count++;
    if (currentInStock === "true") count++;
    setActiveFilters(count);
  }, [currentCategory, currentChildCategory, currentBrand, currentInStock, lockedBrandSlug, lockedCategorySlug]);

  // Update URL parameters
  const updateURL = useCallback((updates) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      if (value && value !== "" && value !== "tous") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });

    // Always reset to page 1 when filters change
    params.delete("page");

    const newURL = `${pathname}?${params.toString()}`;

    const changedKeys = Object.keys(updates);
    const primaryKey = changedKeys[0] || "";
    const primaryValue = updates[primaryKey];
    const eventName = primaryKey === "sortby" ? "sort_change" : "filter_apply";
    const gaEventName = primaryKey === "sortby" ? "sort_change" : "filter_apply";

    void trackAnalyticsEvent({
      eventName,
      gaEventName,
      pagePath: newURL,
      metadata: {
        changedKey: primaryKey,
        changedValue: primaryValue ?? null,
        filters: Object.fromEntries(params.entries()),
      },
      gaParams: {
        changed_key: primaryKey,
        changed_value: primaryValue ?? "",
      },
    });

    router.push(newURL);

    // Notify parent component
    if (onFiltersChange) {
      onFiltersChange();
    }
  }, [searchParams, pathname, router, onFiltersChange]);

  // Clear all filters
  const clearAllFilters = () => {
    void trackAnalyticsEvent({
      eventName: "filter_apply",
      gaEventName: "filter_apply",
      pagePath: pathname,
      metadata: {
        changedKey: "clear_all",
        filters: {},
      },
    });
    router.push(pathname);
    if (onFiltersChange) {
      onFiltersChange();
    }
  };

  // Get child categories for selected parent category
  const getChildCategories = () => {
    if (!currentCategory || currentCategory === "tous") return [];
    const parentCategory = categories.find(cat => cat.slug === currentCategory);
    return parentCategory?.children || [];
  };

  // Sort options
  const sortOptions = [
    { value: "", label: t("nv") },
    { value: "price", label: t("pc") },
    { value: "-price", label: t("pd") },
    { value: "name", label: t("nc") },
    { value: "-name", label: t("nd") },
  ];

  const getCurrentSortLabel = () => {
    const option = sortOptions.find(opt => opt.value === currentSort);
    return option?.label || sortOptions[0].label;
  };

  return (
    <div className="sf-container mt-4">
      <div className="sf-surface rounded-[1.5rem] px-4 sm:px-6 lg:px-8">
        {/* Mobile Filter Bar */}
        <div className="flex items-center justify-between py-4 lg:hidden">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className="flex items-center space-x-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:text-teal-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707v4.586l-4-2V9.414a1 1 0 00-.293-.707L3.293 2.707A1 1 0 013 2V4z" />
              </svg>
              <span className="text-sm font-medium">{t("rtr")}</span>
              {activeFilters > 0 && (
                <span className="rounded-full bg-teal-700 px-2 py-1 text-xs text-white">
                  {activeFilters}
                </span>
              )}
            </button>

            <button
              onClick={() => setIsSortOpen(!isSortOpen)}
              className="flex items-center space-x-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:text-teal-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
              </svg>
              <span className="text-sm font-medium">{t("tri")}</span>
            </button>
          </div>

          {totalCount > 0 && (
            <p className="text-sm text-slate-600">
              {totalCount} {t("products")}
            </p>
          )}
        </div>

        {/* Desktop Filter Bar */}
        <div className="hidden lg:flex items-center justify-between py-6">
          <div className="flex items-center space-x-6">

            {/* Category Filter */}
            {!lockedCategorySlug && (
              <select
                value={currentCategory}
                onChange={(e) => updateURL({ category: e.target.value, childCategory: "" })}
                className="min-w-40 rounded-full border border-slate-300 bg-white px-4 py-2 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              >
                <option value="">{t("Tous")} {t("cats")}</option>
                {categories.map((category) => (
                  <option key={category._id} value={category.slug || ""}>
                    {t("catn", {
                catn: category?.name,
                catnar:
                  category?.name_ar?.length > 2
                    ? category?.name_ar
                    : category?.name,
              })}
                  </option>
                ))}
              </select>
            )}

            {/* Child Category Filter */}
            {getChildCategories().length > 0 && (
              <select
                value={currentChildCategory}
                onChange={(e) => updateURL({ childCategory: e.target.value })}
                className="min-w-40 rounded-full border border-slate-300 bg-white px-4 py-2 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              >
                <option value="">{t("Tous")}</option>
                {getChildCategories().map((child) => (
                  <option key={child._id} value={child.slug || ""}>
                    {child.name || child.name_en}
                  </option>
                ))}
              </select>
            )}

            {/* Brand Filter */}
            {!lockedBrandSlug && brands.length > 0 && (
              <select
                value={currentBrand}
                onChange={(e) => updateURL({ brand: e.target.value })}
                className="min-w-40 rounded-full border border-slate-300 bg-white px-4 py-2 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              >
                <option value="">{t("Tous")} {t("marq")}</option>
                {brands.map((brand) => (
                  <option key={brand._id} value={brand.slug || ""}>
                    {brand.name}
                  </option>
                ))}
              </select>
            )}

            {/* In Stock Toggle */}
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={currentInStock === "true"}
                onChange={(e) => updateURL({ instock: e.target.checked ? "true" : "" })}
                className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
              />
              <span className="text-sm font-medium text-slate-700">{t("es")}</span>
            </label>
          </div>

          <div className="flex items-center space-x-4">
            {/* Sort Dropdown */}
            <div className="relative">
              <select
                value={currentSort}
                onChange={(e) => updateURL({ sortby: e.target.value })}
                className="min-w-48 appearance-none rounded-full border border-slate-300 bg-white px-4 py-2 pr-8 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-3 top-2.5 h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {/* Results Count */}
            {totalCount > 0 && (
              <p className="whitespace-nowrap text-sm text-slate-600">
                {totalCount} {t("products")}
              </p>
            )}

            {/* Clear Filters */}
            {activeFilters > 0 && (
              <button
                onClick={clearAllFilters}
                className="whitespace-nowrap text-sm font-medium text-teal-700 hover:text-teal-600"
              >
                {t("Clear all filters")} ({activeFilters})
              </button>
            )}
          </div>
        </div>

        {/* Mobile Filter Panel */}
        {isFilterOpen && (
          <div className="space-y-4 border-t border-slate-200 py-4 lg:hidden">

            {/* Mobile Filters Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Category */}
              {!lockedCategorySlug && (
                <select
                  value={currentCategory}
                  onChange={(e) => updateURL({ category: e.target.value, childCategory: "" })}
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                >
                  <option value="">{t("Tous")} {t("cats")}</option>
                  {categories.map((category) => (
                    <option key={category._id} value={category.slug || ""}>
                      {t("catn", {
                catn: category?.name,
                catnar:
                  category?.name_ar?.length > 2
                    ? category?.name_ar
                    : category?.name,
              })}
                    </option>
                  ))}
                </select>
              )}

              {/* Child Category */}
              {getChildCategories().length > 0 && (
                <select
                  value={currentChildCategory}
                  onChange={(e) => updateURL({ childCategory: e.target.value })}
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                >
                  <option value="">{t("Tous")}</option>
                  {getChildCategories().map((child) => (
                    <option key={child._id} value={child.slug || ""}>
                      {child.name || child.name_en}
                    </option>
                  ))}
                </select>
              )}

              {/* Brand */}
              {!lockedBrandSlug && brands.length > 0 && (
                <select
                  value={currentBrand}
                  onChange={(e) => updateURL({ brand: e.target.value })}
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                >
                  <option value="">{t("Tous")} {t("marq")}</option>
                  {brands.map((brand) => (
                    <option key={brand._id} value={brand.slug || ""}>
                      {brand.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* In Stock Toggle */}
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={currentInStock === "true"}
                onChange={(e) => updateURL({ instock: e.target.checked ? "true" : "" })}
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm font-medium text-slate-700">{t("es")}</span>
            </label>

            {/* Clear Filters Mobile */}
            {activeFilters > 0 && (
              <button
                onClick={clearAllFilters}
                className="w-full rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:text-teal-700"
              >
                {t("Clear all filters")} ({activeFilters})
              </button>
            )}
          </div>
        )}

        {/* Mobile Sort Panel */}
        {isSortOpen && (
          <div className="border-t border-slate-200 py-4 lg:hidden">
            <div className="space-y-2">
              {sortOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    updateURL({ sortby: option.value });
                    setIsSortOpen(false);
                  }}
                  className={`w-full rounded-full px-4 py-2 text-left transition-colors ${
                    currentSort === option.value
                      ? 'border border-teal-200 bg-teal-50 text-teal-700'
                      : 'hover:bg-white'
                  }`}
                >
                  {option.label}
                  {currentSort === option.value && (
                    <svg className="inline w-4 h-4 ml-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Active Filters Display */}
        {activeFilters > 0 && (
          <div className="border-t border-slate-200 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 flex-wrap gap-2">
                <span className="text-sm text-slate-600">{t("rtr")}:</span>

                {currentCategory && currentCategory !== "tous" && (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    {t("cat")} {categories.find(c => c._id === currentCategory)?.name || t("Tous")}
                    <button
                      onClick={() => updateURL({ category: "", childCategory: "" })}
                      className="ml-2 hover:text-teal-600"
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </span>
                )}

                {currentBrand && currentBrand !== "tous" && (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    {t("marq")}: {brands.find(b => b._id === currentBrand)?.name || t("Tous")}
                    <button
                      onClick={() => updateURL({ brand: "" })}
                      className="ml-2 hover:text-teal-600"
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </span>
                )}

                {currentInStock === "true" && (
                  <span className="inline-flex items-center rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">
                    {t("es")}
                    <button
                      onClick={() => updateURL({ instock: "" })}
                      className="ml-2 hover:text-teal-600"
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </span>
                )}
              </div>

              <button
                onClick={clearAllFilters}
                className="text-sm font-medium text-slate-500 hover:text-teal-700"
              >
                {t("Clear all filters")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
