"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import Embla from "./Embla";

export default function Brand({ brandid }) {
  const t = useTranslations("common");
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [brand, setBrand] = useState(null);

  const pathname = usePathname();
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await fetch(
          "/api/track?brand=" + (brandid ? brandid : "")
        );
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

    setLoading(true);
    fetchProducts();
    fetchBrand();
    setLoading(false);
  }, [brandid]);

  if (products.length < 4) {
    return null;
  } else if (!products) {
    return null;
  } else if (products[0]?.images[0]) {
    return (
      <div className="overflow-hidden">
        {pathname.includes("/products") || pathname.includes("/landing") ? (
          <h1 className="lg:text-3xl lg:font-medium lg:mt-16 text-xl font-bold mt-16">
            {t("simpms")}:
          </h1>
        ) : (
          <h1
            className={
              "font-semibold text-3xl lg:text-4xl  my-8 text-center w-full" +
              pathname.includes("/products")
                ? "hidden"
                : ""
            }
          >
            {t("prods")} {brand?.name}
          </h1>
        )}
        <div className=" border-y-2 border-solid mt-3 border-teal-600   px-2 ">
          <Embla products={products}></Embla>
        </div>{" "}
        <Link
          href={"/products?brand=" + brandid}
          className="text-white flex mb-12  hover:bg-teal-500 transition-colors duration-200 text-lg   bg-teal-600  w-[65%] mx-auto rounded-full md:text-2xl justify-center py-1   mt-2"
        >
          {" "}
          {t("vpd")} {brand?.name}
        </Link>
      </div>
    );
  }
}
