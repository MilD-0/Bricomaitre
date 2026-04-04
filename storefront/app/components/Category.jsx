"use client";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import Embla from "./Embla";
import { buildCategoryFilterHref } from "@/lib/storefront-api";
import { Link, usePathname } from "@/i18n/navigation";

export default function Category({ categoryid }) {
  const t = useTranslations("common");
  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState("");
  const pathname = usePathname();

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await fetch("/api/track?&category=" + (categoryid ? categoryid : ""));
        const data = await response.json();
        setProducts(data.products);
      } catch (error) {
        console.error(error);
      }
    };
    const fetchCategory = async () => {
      try {
        const response = await fetch("/api/category?id=" + categoryid);
        const data0 = await response.json();
        setCategory(data0);
      } catch (error) {
        console.error(error);
      }
    };

    fetchProducts();
    fetchCategory();
  }, [categoryid]);

  if (!products?.length || products.length < 4 || !products[0]?.images?.[0]) {
    return null;
  }

  return (
    <section className="overflow-hidden">
      <div className="sf-container text-center">
        {pathname.includes("/products") || pathname.includes("/landing") ? (
          <h1 className="sf-title mt-8 text-3xl">{t("simps")}:</h1>
        ) : (
          <h1 className="sf-title mt-8 text-3xl">
            {t("cat")}{" "}
            {t("catn", {
              catn: category?.name,
              catnar: category?.name_ar?.length > 2 ? category?.name_ar : category?.name,
            })}
          </h1>
        )}
      </div>
      <div className="sf-container mt-6">
        <div className="sf-card overflow-hidden px-2 py-3">
          <Embla products={products} />
        </div>
      </div>
      <div className="sf-container mt-4 flex justify-center">
        <Link href={buildCategoryFilterHref({ category })} className="sf-button">
          {t("vp")}
        </Link>
      </div>
    </section>
  );
}
