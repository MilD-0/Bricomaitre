"use client";
import Image from "next/image";

import { useState, useEffect, useContext } from "react";
import { useTranslations } from "next-intl";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

import { CartContext } from "./cartContext";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Category({ categoryid }) {
  const t = useTranslations("common");

  const { addProduct } = useContext(CartContext);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);

  const [category, setCategory] = useState("");

  const pathname = usePathname();
  const [childCategory, setChildCategory] = useState("");
  const [isClicked, setIsClicked] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  var settings = {
    dots: false,
    infinite: true,
    speed: 500,
    slidesToShow: 4,
    slidesToScroll: 1,
    autoplay: false,
    autoplaySpeed: 2000,
    pauseOnHover: true,
    swipeToSlide: true,
    responsive: [
      {
        breakpoint: 1024,
        settings: {
          slidesToShow: 3,
          slidesToScroll: 1,
          pauseOnHover: true,
        },
      },
      {
        breakpoint: 600,
        settings: {
          slidesToShow: 2,
          slidesToScroll: 1,
          pauseOnHover: true,
        },
      },
    ],
  };

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
  }, [, categoryid, childCategory]);

  if (products.length < 4) {
    return null;
  } else if (loading || !category) {
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
          <Slider {...settings}>
            {products.map((product) => (
              <div
                key={product._id}
                className=" flex w-full gap-2 rounded-lg  p-1"
              >
                {" "}
                <Link
                  onMouseDown={(e) => {
                    setIsClicked(true);
                  }}
                  onMouseUp={(e) => {
                    if (!isDragging) {
                      window.location.href = "/products/" + product._id;
                    }
                    setIsClicked(false);
                    setIsDragging(false);
                  }}
                  onMouseMove={(e) => {
                    if (isClicked) {
                      setIsDragging(true);
                    }
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                  }}
                  href={"/products/" + product._id}
                >
                  <div className="  rounded-2xl overflow-hidden  flex h-[10rem] lg:h-[10rem] xl:h-[12rem] 2xl:h-[16rem] p-2 relative  bg-white ">
                    <Image
                      src={product?.images[0]}
                      height={600}
                      width={600}
                      alt="product-img"
                      style={{ objectFit: "contain" }}
                      className="hover:scale-125 transform transition duration-300  "
                    />
                  </div>
                </Link>
                <Link target="_blank" href={"/products/" + product._id}>
                  <h1 className="font-semibold text-sm text-ellipsis text-wrap hover:text-teal-600 transition-colors duration-300 text-center  line-clamp-2 lg:text-base">
                    {t("prodt", {
                      name: product.title,
                      namear:
                        product.title_ar.length > 2
                          ? product.title_ar
                          : product.title,
                    })}
                  </h1>
                </Link>
                <div className="flex px-8 items-center justify-center gap-4 ">
                  <h1 className="font-semibold  md:text-xl text-emerald-700">
                    {product.price}
                    {t("da")}
                  </h1>

                  <button
                    onClick={() => product.stock > 0 && addProduct(product._id)}
                    className="    bg-teal-600  text-white py-1 text-center w-1/3 rounded-full hover:bg-teal-500 transition-colors duration-200 flex px-3 flex-row"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke-width="1.5"
                      stroke="currentColor"
                      class="mx-auto size-6"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </Slider>
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
