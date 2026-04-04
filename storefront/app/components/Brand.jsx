"use client";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import Embla from "./Embla";
import { buildBrandHref } from "@/lib/storefront-api";
import { Link, usePathname } from "@/i18n/navigation";

export default function Brand({ brandid }) {
  const t = useTranslations("common");
  const [products, setProducts] = useState([]);
  const [brand, setBrand] = useState(null);

  const pathname = usePathname();
  const brandHref = buildBrandHref(brand);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await fetch("/api/track?brand=" + (brandid ? brandid : ""));
        const data = await response.json();
        setProducts(data.products);
      } catch (error) {
        console.error(error);
      }
    };

    const fetchBrand = async () => {
      try {
        const response = await fetch("/api/brando?id=" + brandid);
        const data1 = await response.json();
        setBrand(data1);
      } catch (error) {
        console.error(error);
      }
    };

    fetchProducts();
    fetchBrand();
  }, [brandid]);

  if (!products?.length || products.length < 4 || !products[0]?.images?.[0]) {
    return null;
  }

  return (
    <section className="overflow-hidden">
      <div className="sf-container text-center">
        {pathname.includes("/products") || pathname.includes("/landing") ? (
          <h1 className="sf-title mt-8 text-3xl">{t("simpms")}:</h1>
        ) : (
          <h1 className="sf-title mt-8 text-3xl">{t("prods")} {brand?.name}</h1>
        )}
      </div>
      <div className="sf-container mt-6">
        <div className="sf-card overflow-hidden px-2 py-3">
          <Embla products={products} />
        </div>
      </div>
      <div className="sf-container mt-4 flex justify-center">
        <Link href={brandHref} className="sf-button">
          {t("vpd")} {brand?.name}
        </Link>
      </div>
    </section>
  );
}
