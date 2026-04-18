"use client";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Embla from "./Embla";

export default function Category({ categoryid }) {
  const t = useTranslations("common");
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);

  const [category, setCategory] = useState("");

  const pathname = usePathname();
  const [childCategory, setChildCategory] = useState("");
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await fetch(
          "/api/track?&category=" +
            (categoryid ? categoryid : "") +
            "&childCategory=" +
            (childCategory ? childCategory : "")
        );
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

    setLoading(true);
    fetchProducts();
    fetchCategory();

    setLoading(false);
  }, [categoryid, childCategory]);

  if (products.length < 4) {
    return null;
  } else if (!products) {
    return null;
  } else if (products[0]?.images[0]) {
    return (
      <div className="overflow-hidden">
        {pathname.includes("/products") || pathname.includes("/landing") ? (
          <h1 className="lg:text-3xl lg:font-medium lg:mt-16 text-xl font-bold mt-16">
            {t("simps")}:
          </h1>
        ) : (
          <h1 className="font-semibold text-3xl lg:text-4xl  my-8 text-center w-full">
            {t("cat")}{" "}
            {t("catn", {
              catn: category?.name,
              catnar:
                category?.name_ar?.length > 2
                  ? category?.name_ar
                  : category?.name,
            })}
          </h1>
        )}
        <div className=" border-y-2 border-solid mt-3 border-teal-600   px-2 ">
          <Embla products={products}></Embla>
        </div>{" "}
        <Link
          href={
            !parent
              ? "/products?category=" + categoryid
              : "/products?category=" +
                category.parent +
                "&childCategory=" +
                categoryid
          }
          className="text-white flex mb-12  hover:bg-teal-500 transition-colors duration-200 text-lg   bg-teal-600  w-[65%] mx-auto rounded-full md:text-2xl justify-center py-1   mt-2"
        >
          {" "}
          {t("vp")}{" "}
        </Link>
      </div>
    );
  }
}
