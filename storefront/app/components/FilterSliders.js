// components/FilterSliders.js - Combined component with both sliders
"use client";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import useEmblaCarousel from "embla-carousel-react";
import Image from "next/image";
import { useCallback } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";

// Category Slider Component
function CategorySlider({ categories = [], lockedCategorySlug = "" }) {
  const t = useTranslations("common");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const currentCategory = lockedCategorySlug || searchParams.get("category") || "";

  const dir = locale === "ar" ? "rtl" : "ltr";
  const OPTIONS = {
    dragFree: true,
    loop: false,
    direction: dir,
    align: "start"
  };
  const [emblaRef] = useEmblaCarousel(OPTIONS);

  const handleCategorySelect = useCallback((categorySlug) => {
    const params = new URLSearchParams(searchParams.toString());

    if (categorySlug === currentCategory) {
      // If clicking the same category, clear it
      params.delete("category");

    } else {
      // Set new category and clear child category
      params.set("category", categorySlug);

    }

    // Reset to page 1
    params.delete("page");

    const newURL = `${pathname}?${params.toString()}`;
    router.push(newURL);
  }, [searchParams, pathname, router, currentCategory]);

  if (!categories || categories.length === 0) {
    return null;
  }

  if (lockedCategorySlug) {
    return null;
  }

  return (
    <div className="bg-transparent py-4">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {t("cats") || "Shop by Category"}
          </h2>
          <button
            onClick={() => handleCategorySelect("")}
            className={`text-sm font-medium transition-colors ${
              !currentCategory
                ? "text-teal-600"
                : "text-gray-500 hover:text-teal-600"
            }`}
          >
            {t("catsViewAll") || "View All"}
          </button>
        </div>

        <section className="embla">
          <div className="embla__viewport" ref={emblaRef}>
            <div className="embla__container pt-3">
              {categories.map((category) => (
                <div key={category._id} className="embla__slide min-w-0 flex-[0_0_auto] mr-4 last:mr-0">
                  <button
                    onClick={() => handleCategorySelect(category.slug || "")}
                    className={`group relative w-32 lg:w-36 xl:w-40 transition-all duration-300 ${
                      currentCategory === category.slug
                        ? "transform scale-105"
                        : "hover:transform hover:scale-105"
                    }`}
                  >
                    {/* Category Image */}
                    <div className={`aspect-square rounded-2xl overflow-hidden border border-slate-200 p-3 transition-all duration-300 ${
                      currentCategory === category.slug
                        ? "bg-white ring-2 ring-teal-500 shadow-lg"
                        : "bg-white shadow-md hover:shadow-lg"
                    }`}>
                      <Image
                        src={category.image || "/placeholder-category.jpg"}
                        height={200}
                        width={200}
                        alt={category.name || category.name_en || "Category"}
                        className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-110"
                        sizes="(max-width: 768px) 128px, (max-width: 1200px) 144px, 160px"
                      />
                    </div>

                    {/* Category Name */}
                    <h3 className={`mt-2 text-sm font-medium text-center line-clamp-2 transition-colors duration-300 ${
                      currentCategory === category.slug
                        ? "text-teal-700"
                        : "text-gray-700 group-hover:text-teal-600"
                    }`}>
                      {t("catn", {
                      catn: category.name,
                      catnar:
                        category.name_ar.length > 2
                          ? category.name_ar
                          : category.name,
                    })}
                    </h3>

                    {/* Product Count (if available) */}
                    {category.productCount && (
                      <p className="text-xs text-gray-500 mt-1">
                        {category.productCount} {category.productCount === 1 ? 'product' : 'products'}
                      </p>
                    )}

                    {/* Selection Indicator */}
                    {currentCategory === category.slug && (
                      <div className="absolute -top-1 -right-1 w-6 h-6 bg-teal-500 rounded-full flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// Brand Slider Component
function BrandSlider({ brands = [], lockedBrandSlug = "" }) {
  const t = useTranslations("common");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const currentBrand = lockedBrandSlug || searchParams.get("brand") || "";

  const dir = locale === "ar" ? "rtl" : "ltr";
  const OPTIONS = {
    dragFree: true,
    loop: false,
    direction: dir,
    align: "start"
  };
  const [emblaRef] = useEmblaCarousel(OPTIONS);

  const handleBrandSelect = useCallback((brandSlug) => {
    const params = new URLSearchParams(searchParams.toString());

    if (brandSlug === currentBrand) {
      // If clicking the same brand, clear it
      params.delete("brand");
    } else {
      // Set new brand
      params.set("brand", brandSlug);
    }

    // Reset to page 1
    params.delete("page");

    const newURL = `${pathname}?${params.toString()}`;
    router.push(newURL);
  }, [searchParams, pathname, router, currentBrand]);

  if (!brands || brands.length === 0) {
    return null;
  }

  if (lockedBrandSlug) {
    return null;
  }

  return (
    <div className="py-4 bg-white border-t border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {t("marq") || "Shop by Brand"}
          </h2>
          <button
            onClick={() => handleBrandSelect("")}
            className={`text-sm font-medium transition-colors ${
              !currentBrand
                ? "text-teal-600"
                : "text-gray-500 hover:text-teal-600"
            }`}
          >
            {t("brandsViewAll") || "View All"}
          </button>
        </div>

        <section className="embla">
          <div className="embla__viewport" ref={emblaRef}>
            <div className="embla__container pt-2">
              {brands.map((brand) => (
                <div key={brand._id} className="embla__slide min-w-0 flex-[0_0_auto] mr-4 last:mr-0">
                  <button
                    onClick={() => handleBrandSelect(brand.slug || "")}
                    className={`group relative w-28 lg:w-32 xl:w-36 transition-all duration-300 ${
                      currentBrand === brand.slug
                        ? "transform scale-105"
                        : "hover:transform hover:scale-105"
                    }`}
                  >
                    {/* Brand Image */}
                    <div className={`aspect-square rounded-xl overflow-hidden border border-slate-200 p-2 transition-all duration-300 ${
                      currentBrand === brand.slug
                        ? "bg-white ring-2 ring-teal-400 shadow-lg"
                        : "bg-white shadow-sm hover:shadow-md"
                    }`}>
                      <Image
                        src={brand.image || "/placeholder-brand.jpg"}
                        height={150}
                        width={150}
                        alt={brand.name || "Brand"}
                        className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-110"
                        sizes="(max-width: 768px) 112px, (max-width: 1200px) 128px, 144px"
                      />
                    </div>

                    {/* Brand Name */}
                    <h3 className={`mt-2 text-sm font-medium text-center line-clamp-1 transition-colors duration-300 ${
                      currentBrand === brand.slug
                        ? "text-teal-700"
                        : "text-gray-700 group-hover:text-teal-600"
                    }`}>
                      {brand.name}
                    </h3>

                    {/* Product Count (if available) */}
                    {brand.productCount && (
                      <p className="text-xs text-gray-500 mt-1">
                        {brand.productCount} {brand.productCount === 1 ? 'product' : 'products'}
                      </p>
                    )}

                    {/* Selection Indicator */}
                    {currentBrand === brand.slug && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 bg-teal-500 rounded-full flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// Main FilterSliders Component - Export this one
export default function FilterSliders({
  categories,
  brands,
  className = "",
  lockedBrandSlug = "",
  lockedCategorySlug = "",
}) {
  const hasCategories = categories && categories.length > 0;
  const hasBrands = brands && brands.length > 0;

  if (!hasCategories && !hasBrands) {
    return null;
  }

  return (
    <div className={`border-b border-gray-200 ${className}`}>
      {hasCategories && (
        <CategorySlider
          categories={categories}
          lockedCategorySlug={lockedCategorySlug}
        />
      )}
      {hasBrands && (
        <BrandSlider brands={brands} lockedBrandSlug={lockedBrandSlug} />
      )}
    </div>
  );
}
