// FilterSortBar.js
"use client";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

export default function FilterSortBar({
  categories = [],
  brands = [],
  totalCount = 0,
  onFiltersChange
}) {
  const t = useTranslations("common");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState(0);

  // Get current values from URL
  const currentCategory = searchParams.get("category") || "";
  const currentChildCategory = searchParams.get("childCategory") || "";
  const currentBrand = searchParams.get("brand") || "";
  const currentInStock = searchParams.get("instock") || "";
  const currentSort = searchParams.get("sortby") || "";

  // Count active filters
  useEffect(() => {
    let count = 0;
    if (currentCategory && currentCategory !== "tous") count++;
    if (currentChildCategory && currentChildCategory !== "tous") count++;
    if (currentBrand && currentBrand !== "tous") count++;
    if (currentInStock === "true") count++;
    setActiveFilters(count);
  }, [currentCategory, currentChildCategory, currentBrand, currentInStock]);

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
    router.push(newURL);

    // Notify parent component
    if (onFiltersChange) {
      onFiltersChange();
    }
  }, [searchParams, pathname, router, onFiltersChange]);

  // Clear all filters
  const clearAllFilters = () => {
    router.push(pathname);
    if (onFiltersChange) {
      onFiltersChange();
    }
  };

  // Get child categories for selected parent category
  const getChildCategories = () => {
    if (!currentCategory || currentCategory === "tous") return [];
    const parentCategory = categories.find(cat => cat._id === currentCategory);
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
    <div className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Mobile Filter Bar */}
        <div className="flex items-center justify-between py-4 lg:hidden">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className="flex items-center space-x-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707v4.586l-4-2V9.414a1 1 0 00-.293-.707L3.293 2.707A1 1 0 013 2V4z" />
              </svg>
              <span className="text-sm font-medium">{t("rtr")}</span>
              {activeFilters > 0 && (
                <span className="bg-teal-600 text-white text-xs px-2 py-1 rounded-full">
                  {activeFilters}
                </span>
              )}
            </button>

            <button
              onClick={() => setIsSortOpen(!isSortOpen)}
              className="flex items-center space-x-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
              </svg>
              <span className="text-sm font-medium">{t("tri")}</span>
            </button>
          </div>

          {totalCount > 0 && (
            <p className="text-sm text-gray-600">
              {totalCount} {t("products")}
            </p>
          )}
        </div>

        {/* Desktop Filter Bar */}
        <div className="hidden lg:flex items-center justify-between py-6">
          <div className="flex items-center space-x-6">

            {/* Category Filter */}
            <select
              value={currentCategory}
              onChange={(e) => updateURL({ category: e.target.value, childCategory: "" })}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none bg-white min-w-40"
            >
              <option value="">{t("Tous")} {t("cats")}</option>
              {categories.map((category) => (
                <option key={category._id} value={category._id}>
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

            {/* Child Category Filter */}
            {getChildCategories().length > 0 && (
              <select
                value={currentChildCategory}
                onChange={(e) => updateURL({ childCategory: e.target.value })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none bg-white min-w-40"
              >
                <option value="">{t("Tous")}</option>
                {getChildCategories().map((child) => (
                  <option key={child._id} value={child._id}>
                    {child.name || child.name_en}
                  </option>
                ))}
              </select>
            )}

            {/* Brand Filter */}
            {brands.length > 0 && (
              <select
                value={currentBrand}
                onChange={(e) => updateURL({ brand: e.target.value })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none bg-white min-w-40"
              >
                <option value="">{t("Tous")} {t("marq")}</option>
                {brands.map((brand) => (
                  <option key={brand._id} value={brand._id}>
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
              <span className="text-sm font-medium text-gray-700">{t("es")}</span>
            </label>
          </div>

          <div className="flex items-center space-x-4">
            {/* Sort Dropdown */}
            <div className="relative">
              <select
                value={currentSort}
                onChange={(e) => updateURL({ sortby: e.target.value })}
                className="appearance-none px-4 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none bg-white min-w-48"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <svg className="absolute right-2 top-2.5 w-5 h-5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {/* Results Count */}
            {totalCount > 0 && (
              <p className="text-sm text-gray-600 whitespace-nowrap">
                {totalCount} {t("products")}
              </p>
            )}

            {/* Clear Filters */}
            {activeFilters > 0 && (
              <button
                onClick={clearAllFilters}
                className="text-sm text-teal-600 hover:text-teal-700 font-medium whitespace-nowrap"
              >
                {t("Clear all filters")} ({activeFilters})
              </button>
            )}
          </div>
        </div>

        {/* Mobile Filter Panel */}
        {isFilterOpen && (
          <div className="lg:hidden border-t border-gray-200 py-4 space-y-4">

            {/* Mobile Filters Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Category */}
              <select
                value={currentCategory}
                onChange={(e) => updateURL({ category: e.target.value, childCategory: "" })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none bg-white"
              >
                <option value="">{t("Tous")} {t("cats")}</option>
                {categories.map((category) => (
                  <option key={category._id} value={category._id}>
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

              {/* Child Category */}
              {getChildCategories().length > 0 && (
                <select
                  value={currentChildCategory}
                  onChange={(e) => updateURL({ childCategory: e.target.value })}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none bg-white"
                >
                  <option value="">{t("Tous")}</option>
                  {getChildCategories().map((child) => (
                    <option key={child._id} value={child._id}>
                      {child.name || child.name_en}
                    </option>
                  ))}
                </select>
              )}

              {/* Brand */}
              {brands.length > 0 && (
                <select
                  value={currentBrand}
                  onChange={(e) => updateURL({ brand: e.target.value })}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none bg-white"
                >
                  <option value="">{t("Tous")} {t("marq")}</option>
                  {brands.map((brand) => (
                    <option key={brand._id} value={brand._id}>
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
                className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
              />
              <span className="text-sm font-medium text-gray-700">{t("es")}</span>
            </label>

            {/* Clear Filters Mobile */}
            {activeFilters > 0 && (
              <button
                onClick={clearAllFilters}
                className="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm font-medium"
              >
                {t("Clear all filters")} ({activeFilters})
              </button>
            )}
          </div>
        )}

        {/* Mobile Sort Panel */}
        {isSortOpen && (
          <div className="lg:hidden border-t border-gray-200 py-4">
            <div className="space-y-2">
              {sortOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    updateURL({ sortby: option.value });
                    setIsSortOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                    currentSort === option.value
                      ? 'bg-teal-50 text-teal-700 border border-teal-200'
                      : 'hover:bg-gray-50'
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
          <div className="py-3 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 flex-wrap gap-2">
                <span className="text-sm text-gray-600">{t("rtr")}:</span>

                {currentCategory && currentCategory !== "tous" && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {t("cat")} {categories.find(c => c._id === currentCategory)?.name || t("Tous")}
                    <button
                      onClick={() => updateURL({ category: "", childCategory: "" })}
                      className="ml-2 hover:text-blue-600"
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </span>
                )}

                {currentBrand && currentBrand !== "tous" && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                    {t("marq")}: {brands.find(b => b._id === currentBrand)?.name || t("Tous")}
                    <button
                      onClick={() => updateURL({ brand: "" })}
                      className="ml-2 hover:text-purple-600"
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </span>
                )}

                {currentInStock === "true" && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    {t("es")}
                    <button
                      onClick={() => updateURL({ instock: "" })}
                      className="ml-2 hover:text-green-600"
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
                className="text-sm text-gray-500 hover:text-gray-700 font-medium"
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