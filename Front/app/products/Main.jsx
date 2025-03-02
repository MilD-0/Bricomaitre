"use client";
import Image from "next/image";
import Layout from "../components/layout";
import Pagination from "../components/pagini";
import { useState, useEffect, useContext, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

import { CartContext } from "../components/cartContext";
import Link from "next/link";
import { useTranslations } from "next-intl";
import Search2 from "../components/search2";

export default function Products() {
  const [results2, setResults2] = useState([]);
  const t = useTranslations("common");
  let sliderRef = useRef(null);
  let sliderRef2 = useRef(null);
  const next2 = () => {
    sliderRef2.slickNext();
  };
  const previous2 = () => {
    sliderRef2.slickPrev();
  };
  const next = () => {
    sliderRef.slickNext();
  };
  const previous = () => {
    sliderRef.slickPrev();
  };

  var settings2 = {
    dots: true,
    arrows: false,

    speed: 500,
    slidesToShow: 6,
    rows: 2,

    slidesToScroll: 6,

    responsive: [
      {
        breakpoint: 1024,
        settings: {
          slidesToShow: 3,
          slidesToScroll: 1,
          infinite: true,
          dots: true,
        },
      },
      {
        breakpoint: 600,
        settings: {
          slidesToShow: 2,
          slidesToScroll: 2,
          infinite: true,
        },
      },
    ],
  };
  var settings3 = {
    dots: true,
    arrows: false,

    slidesToShow: 10,
    rows: 1,

    slidesToScroll: 10,

    responsive: [
      {
        breakpoint: 860,
        settings: {
          slidesToShow: 6,
          slidesToScroll: 6,
        },
      },
      {
        breakpoint: 600,
        settings: {
          slidesToShow: 4,
          slidesToScroll: 4,

          infinite: true,
        },
      },
    ],
  };
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = searchParams.get("page") || "1";
  const search = searchParams.get("search");
  const { addProduct } = useContext(CartContext);
  const lmt = searchParams.get("limit") || "20";
  const [limit, setLimit] = useState(lmt ? lmt : 20);

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const srt = searchParams.get("sortby");
  const [sortby, setSortby] = useState(srt || "");
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const brnd = searchParams.get("brand");
  const [brand, setBrand] = useState(brnd || "");
  const ctg = searchParams.get("category");
  const [category, setCategory] = useState(ctg || "");
  const stk = searchParams.get("instock");
  const [instock, setInStock] = useState(stk || "");
  const chld = searchParams.get("childCategory");
  const [childCategory, setChildCategory] = useState(chld || "");
  function insertDot(num) {
    let numStr = num.toString();

    if (numStr.length >= 4) {
      return numStr.slice(0, -3) + "." + numStr.slice(-3);
    }

    return numStr;
  }

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await fetch(
          "/api/productcounter?limit=" +
            limit +
            "&page=" +
            page +
            (search ? `&search=${search}` : "") +
            "&sortby=" +
            (sortby ? sortby : "novelty") +
            "&category=" +
            (category ? category : "") +
            "&childCategory=" +
            (childCategory ? childCategory : "") +
            "&brand=" +
            (brand ? brand : "") +
            "&instock=" +
            (instock ? instock : "")
        );
        const data = await response.json();

        setProducts(data.products);
        setTotalPages(data.totalPages);
      } catch (error) {
        console.error(error);
      }
      try {
        const response = await fetch("/api/categories");
        const data0 = await response.json();
        setCategories(data0);
      } catch (error) {
        console.error(error);
      }
    };
    const fetchCategories = async () => {
      try {
        const response = await fetch("/api/categories");
        const data0 = await response.json();
        setCategories(data0);
      } catch (error) {
        console.error(error);
      }
    };

    const fetchBrands = async () => {
      try {
        const response = await fetch("/api/brands");
        const data1 = await response.json();
        setBrands(data1);
      } catch (error) {
        console.error(error);
      }
    };

    setLoading(true);
    fetchProducts();
    fetchCategories();
    fetchBrands();
    setLoading(false);
  }, [
    page,
    limit,
    search,
    sortby,
    brand,
    category,
    brnd,
    ctg,
    srt,
    instock,
    childCategory,
  ]);

  if (loading) {
    return (
      <Layout>
        <div className="flex flex-col mt-2 lg:p-4">
          <div className="flex flex-row justify-between mx-2 mt-4">
            <div className="flex flex-row">
              <span className="font-medium pr-1 lg:text-lg">Marque: </span>
              <select className=" lg:text-lg w-24 border-b border-teal-700 mb-3 bg-transparent outline-none"></select>
            </div>
            <div className="flex flex-row">
              <span className="font-medium pr-1 lg:text-lg">Catégorie: </span>
              <select className="w-24 mb-3 bg-transparent outline-none border-b border-teal-700 lg:text-lg"></select>
            </div>
          </div>
          <div className="flex flex-row justify-between mx-2 mt-2">
            <div className="flex flex-row">
              <div>
                <span className="font-medium pr-1 lg:text-lg">Trier par: </span>{" "}
              </div>
              <select className=" w-[142px] border-b border-teal-700 mb-3 bg-transparent outline-none"></select>
            </div>
            <div>
              <button className="px-2 lg:text-lg">10</button>/
              <button className="px-2 lg:text-lg">16</button>/
              <button className="px-2 lg:text-lg">24</button>
            </div>
          </div>
          <div className="flex flex-row justify-between mx-2 mt-2">
            <div className="flex flex-row items-center ">
              <span className="font-medium pr-2 lg:text-lg">En stock:</span>
              <input type="checkbox" readOnly checked={instock} />
            </div>
            <button className="bg-gray-400 px-4 py-1 rounded text-white lg:text-lg">
              Retirer les filtres
            </button>
          </div>
        </div>

        <div className=" grid grid-cols-2 lg:grid-cols-5 gap-3 p-5 w-screen">
          <div className=" ">
            <div className=" aspect-square w-full flex justify-center items-center bg-gray-300 animate-pulse rounded-xl p-2 mb-2">
              <svg
                className="w-10 h-10 text-gray-200 dark:text-gray-600"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                fill="currentColor"
                viewBox="0 0 20 18"
              >
                <path d="M18 0H2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2Zm-5.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm4.376 10.481A1 1 0 0 1 16 15H4a1 1 0 0 1-.895-1.447l3.5-7A1 1 0 0 1 7.468 6a.965.965 0 0 1 .9.5l2.775 4.757 1.546-1.887a1 1 0 0 1 1.618.1l2.541 4a1 1 0 0 1 .028 1.011Z" />
              </svg>
            </div>
            <div className="h-4 bg-transparent"></div>
            <h1 className="font-semibold text-sm h-4 w-full bg-gray-300 rounded-full mb-1"></h1>
            <h1 className="font-semibold text-sm h-4 w-5/6 bg-gray-300 rounded-full mb-2"></h1>
            <div className="font-bold text-gray-400 text-sm h-5 px-1 w-24 lg:w-32 bg-gray-300 text-end rounded-full mb-2">
              DA
            </div>
            <p className="text-xs font-medium h-3.5 w-24 lg:w-40 bg-gray-300 rounded-full"></p>
          </div>
          <div className=" ">
            <div className=" aspect-square w-full flex justify-center items-center bg-gray-300 animate-pulse rounded-xl p-2 mb-2">
              <svg
                className="w-10 h-10 text-gray-200 dark:text-gray-600"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                fill="currentColor"
                viewBox="0 0 20 18"
              >
                <path d="M18 0H2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2Zm-5.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm4.376 10.481A1 1 0 0 1 16 15H4a1 1 0 0 1-.895-1.447l3.5-7A1 1 0 0 1 7.468 6a.965.965 0 0 1 .9.5l2.775 4.757 1.546-1.887a1 1 0 0 1 1.618.1l2.541 4a1 1 0 0 1 .028 1.011Z" />
              </svg>
            </div>
            <div className="h-4 bg-transparent"></div>
            <h1 className="font-semibold text-sm h-4 w-full bg-gray-300 rounded-full mb-1"></h1>
            <h1 className="font-semibold text-sm h-4 w-5/6 bg-gray-300 rounded-full mb-2"></h1>
            <div className="font-bold text-gray-400 text-sm  h- px-1 w-24 lg:w-32 bg-gray-300 text-end rounded-full mb-2">
              DA
            </div>
            <p className="text-xs font-medium h-3.5 w-24 lg:w-40 bg-gray-300 rounded-full"></p>
          </div>
          <div className=" ">
            <div className=" aspect-square w-full flex justify-center items-center bg-gray-300 animate-pulse rounded-xl p-2 mb-2">
              <svg
                className="w-10 h-10 text-gray-200 dark:text-gray-600"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                fill="currentColor"
                viewBox="0 0 20 18"
              >
                <path d="M18 0H2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2Zm-5.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm4.376 10.481A1 1 0 0 1 16 15H4a1 1 0 0 1-.895-1.447l3.5-7A1 1 0 0 1 7.468 6a.965.965 0 0 1 .9.5l2.775 4.757 1.546-1.887a1 1 0 0 1 1.618.1l2.541 4a1 1 0 0 1 .028 1.011Z" />
              </svg>
            </div>
            <div className="h-4 bg-transparent"></div>
            <h1 className="font-semibold text-sm h-4 w-full bg-gray-300 rounded-full mb-1"></h1>
            <h1 className="font-semibold text-sm h-4 w-5/6 bg-gray-300 rounded-full mb-2"></h1>
            <div className="font-bold text-gray-400 text-sm h-5 px-1 w-24 lg:w-32 bg-gray-300 text-end rounded-full mb-2">
              DA
            </div>
            <p className="text-xs font-medium h-3.5 w-24 lg:w-40 bg-gray-300 rounded-full"></p>
          </div>
          <div className=" ">
            <div className=" aspect-square w-full flex justify-center items-center bg-gray-300 animate-pulse rounded-xl p-2 mb-2">
              <svg
                className="w-10 h-10 text-gray-200 dark:text-gray-600"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                fill="currentColor"
                viewBox="0 0 20 18"
              >
                <path d="M18 0H2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2Zm-5.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm4.376 10.481A1 1 0 0 1 16 15H4a1 1 0 0 1-.895-1.447l3.5-7A1 1 0 0 1 7.468 6a.965.965 0 0 1 .9.5l2.775 4.757 1.546-1.887a1 1 0 0 1 1.618.1l2.541 4a1 1 0 0 1 .028 1.011Z" />
              </svg>
            </div>
            <div className="h-4 bg-transparent"></div>
            <h1 className="font-semibold text-sm h-4 w-full bg-gray-300 rounded-full mb-1"></h1>
            <h1 className="font-semibold text-sm h-4 w-5/6 bg-gray-300 rounded-full mb-2"></h1>
            <div className="font-bold text-gray-400 text-sm  h- px-1 w-24 lg:w-32 bg-gray-300 text-end rounded-full mb-2">
              DA
            </div>
            <p className="text-xs font-medium h-3.5 w-24 lg:w-40 bg-gray-300 rounded-full"></p>
          </div>
          <div className=" ">
            <div className=" aspect-square w-full flex justify-center items-center bg-gray-300 animate-pulse rounded-xl p-2 mb-2">
              <svg
                className="w-10 h-10 text-gray-200 dark:text-gray-600"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                fill="currentColor"
                viewBox="0 0 20 18"
              >
                <path d="M18 0H2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2Zm-5.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm4.376 10.481A1 1 0 0 1 16 15H4a1 1 0 0 1-.895-1.447l3.5-7A1 1 0 0 1 7.468 6a.965.965 0 0 1 .9.5l2.775 4.757 1.546-1.887a1 1 0 0 1 1.618.1l2.541 4a1 1 0 0 1 .028 1.011Z" />
              </svg>
            </div>
            <div className="h-4 bg-transparent"></div>
            <h1 className="font-semibold text-sm h-4 w-full bg-gray-300 rounded-full mb-1"></h1>
            <h1 className="font-semibold text-sm h-4 w-5/6 bg-gray-300 rounded-full mb-2"></h1>
            <div className="font-bold text-gray-400 text-sm h-5 px-1 w-24 lg:w-32 bg-gray-300 text-end rounded-full mb-2">
              DA
            </div>
            <p className="text-xs font-medium h-3.5 w-24 lg:w-40 bg-gray-300 rounded-full"></p>
          </div>
          <div className=" ">
            <div className=" aspect-square w-full flex justify-center items-center bg-gray-300 animate-pulse rounded-xl p-2 mb-2">
              <svg
                className="w-10 h-10 text-gray-200 dark:text-gray-600"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                fill="currentColor"
                viewBox="0 0 20 18"
              >
                <path d="M18 0H2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2Zm-5.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm4.376 10.481A1 1 0 0 1 16 15H4a1 1 0 0 1-.895-1.447l3.5-7A1 1 0 0 1 7.468 6a.965.965 0 0 1 .9.5l2.775 4.757 1.546-1.887a1 1 0 0 1 1.618.1l2.541 4a1 1 0 0 1 .028 1.011Z" />
              </svg>
            </div>
            <div className="h-4 bg-transparent"></div>
            <h1 className="font-semibold text-sm h-4 w-full bg-gray-300 rounded-full mb-1"></h1>
            <h1 className="font-semibold text-sm h-4 w-5/6 bg-gray-300 rounded-full mb-2"></h1>
            <div className="font-bold text-gray-400 text-sm  h- px-1 w-24 lg:w-32 bg-gray-300 text-end rounded-full mb-2">
              DA
            </div>
            <p className="text-xs font-medium h-3.5 w-24 lg:w-40 bg-gray-300 rounded-full"></p>
          </div>
          <div className=" ">
            <div className=" aspect-square w-full flex justify-center items-center bg-gray-300 animate-pulse rounded-xl p-2 mb-2">
              <svg
                className="w-10 h-10 text-gray-200 dark:text-gray-600"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                fill="currentColor"
                viewBox="0 0 20 18"
              >
                <path d="M18 0H2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2Zm-5.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm4.376 10.481A1 1 0 0 1 16 15H4a1 1 0 0 1-.895-1.447l3.5-7A1 1 0 0 1 7.468 6a.965.965 0 0 1 .9.5l2.775 4.757 1.546-1.887a1 1 0 0 1 1.618.1l2.541 4a1 1 0 0 1 .028 1.011Z" />
              </svg>
            </div>
            <div className="h-4 bg-transparent"></div>
            <h1 className="font-semibold text-sm h-4 w-full bg-gray-300 rounded-full mb-1"></h1>
            <h1 className="font-semibold text-sm h-4 w-5/6 bg-gray-300 rounded-full mb-2"></h1>
            <div className="font-bold text-gray-400 text-sm h-5 px-1 w-24 lg:w-32 bg-gray-300 text-end rounded-full mb-2">
              DA
            </div>
            <p className="text-xs font-medium h-3.5 w-24 lg:w-40 bg-gray-300 rounded-full"></p>
          </div>
          <div className=" ">
            <div className=" aspect-square w-full flex justify-center items-center bg-gray-300 animate-pulse rounded-xl p-2 mb-2">
              <svg
                className="w-10 h-10 text-gray-200 dark:text-gray-600"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                fill="currentColor"
                viewBox="0 0 20 18"
              >
                <path d="M18 0H2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2Zm-5.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm4.376 10.481A1 1 0 0 1 16 15H4a1 1 0 0 1-.895-1.447l3.5-7A1 1 0 0 1 7.468 6a.965.965 0 0 1 .9.5l2.775 4.757 1.546-1.887a1 1 0 0 1 1.618.1l2.541 4a1 1 0 0 1 .028 1.011Z" />
              </svg>
            </div>
            <div className="h-4 bg-transparent"></div>
            <h1 className="font-semibold text-sm h-4 w-full bg-gray-300 rounded-full mb-1"></h1>
            <h1 className="font-semibold text-sm h-4 w-5/6 bg-gray-300 rounded-full mb-2"></h1>
            <div className="font-bold text-gray-400 text-sm  h- px-1 w-24 lg:w-32 bg-gray-300 text-end rounded-full mb-2">
              DA
            </div>
            <p className="text-xs font-medium h-3.5 w-24 lg:w-40 bg-gray-300 rounded-full"></p>
          </div>
          <div className=" ">
            <div className=" aspect-square w-full flex justify-center items-center bg-gray-300 animate-pulse rounded-xl p-2 mb-2">
              <svg
                className="w-10 h-10 text-gray-200 dark:text-gray-600"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                fill="currentColor"
                viewBox="0 0 20 18"
              >
                <path d="M18 0H2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2Zm-5.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm4.376 10.481A1 1 0 0 1 16 15H4a1 1 0 0 1-.895-1.447l3.5-7A1 1 0 0 1 7.468 6a.965.965 0 0 1 .9.5l2.775 4.757 1.546-1.887a1 1 0 0 1 1.618.1l2.541 4a1 1 0 0 1 .028 1.011Z" />
              </svg>
            </div>
            <div className="h-4 bg-transparent"></div>
            <h1 className="font-semibold text-sm h-4 w-full bg-gray-300 rounded-full mb-1"></h1>
            <h1 className="font-semibold text-sm h-4 w-5/6 bg-gray-300 rounded-full mb-2"></h1>
            <div className="font-bold text-gray-400 text-sm h-5 px-1 w-24 lg:w-32 bg-gray-300 text-end rounded-full mb-2">
              DA
            </div>
            <p className="text-xs font-medium h-3.5 w-24 lg:w-40 bg-gray-300 rounded-full"></p>
          </div>
          <div className=" ">
            <div className=" aspect-square w-full flex justify-center items-center bg-gray-300 animate-pulse rounded-xl p-2 mb-2">
              <svg
                className="w-10 h-10 text-gray-200 dark:text-gray-600"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                fill="currentColor"
                viewBox="0 0 20 18"
              >
                <path d="M18 0H2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2Zm-5.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm4.376 10.481A1 1 0 0 1 16 15H4a1 1 0 0 1-.895-1.447l3.5-7A1 1 0 0 1 7.468 6a.965.965 0 0 1 .9.5l2.775 4.757 1.546-1.887a1 1 0 0 1 1.618.1l2.541 4a1 1 0 0 1 .028 1.011Z" />
              </svg>
            </div>
            <div className="h-4 bg-transparent"></div>
            <h1 className="font-semibold text-sm h-4 w-full bg-gray-300 rounded-full mb-1"></h1>
            <h1 className="font-semibold text-sm h-4 w-5/6 bg-gray-300 rounded-full mb-2"></h1>
            <div className="font-bold text-gray-400 text-sm  h- px-1 w-24 lg:w-32 bg-gray-300 text-end rounded-full mb-2">
              DA
            </div>
            <p className="text-xs font-medium h-3.5 w-24 lg:w-40 bg-gray-300 rounded-full"></p>
          </div>
        </div>
      </Layout>
    );
  } else if (products) {
    return (
      <Layout>
        <div className="w-[90%] pt-8 mx-auto">
          <div className="flex  flex-row ">
            <h1 className="text-xl mb-2 md:text-2xl justify-center mx-auto font-semibold">
              <div className="flex ps-8 flex-row gap-2">
                {t("cats")}
                <select
                  value="..."
                  onChange={(ev) => {
                    if (ctg == ev.target.value) {
                      setCategory("");
                      router.push(
                        `/products?page=${1}${limit ? `&limit=${limit}` : ""}${
                          search ? `&search=${search}` : ""
                        }${`&brand=${brand}`}${
                          sortby ? `&sortby=${sortby}` : ""
                        }${
                          instock === true ? `&instock=${instock}` : ""
                        }&#products`
                      );
                    } else {
                      setCategory(ev.target.value);
                      router.push(
                        `/products?page=${1}${limit ? `&limit=${limit}` : ""}${
                          search ? `&search=${search}` : ""
                        }${`&brand=${brand}`}${`&category=${ev.target.value}`}${
                          sortby ? `&sortby=${sortby}` : ""
                        }${
                          instock === true ? `&instock=${instock}` : ""
                        }&#products`
                      );
                    }
                  }}
                  className="overflow-y-auto  scale-75 text-center rounded-lg w-11 outline-none focus:outline-none aspect-square p-1 px-2 border-white bg-teal-600 text-white border-2 align-middle appearance-none -mt-2"
                >
                  <option
                    value="..."
                    className="text-xl hidden md:text-2xl bg-white text-black"
                  >
                    ...
                  </option>
                  <option value="" className="  bg-white text-base text-black">
                    Tous
                  </option>
                  {categories.map((category) => (
                    <option
                      value={category._id}
                      key={category._id}
                      className="bg-white  text-base text-black "
                    >
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
            </h1>
          </div>
          <div dir="ltr" className="grid grid-cols-12 align-middle mb-12">
            <div className=" justify-center mx-auto mt-12 ">
              <button
                className={" bg-teal-600 rounded-lg - text-white "}
                onClick={previous2}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="1.5"
                  stroke="currentColor"
                  className="size-5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M15.75 19.5 8.25 12l7.5-7.5"
                  />
                </svg>
              </button>
            </div>
            <div className="col-span-10  pt-2">
              <Slider
                ref={(slider) => {
                  sliderRef2 = slider;
                }}
                {...settings3}
              >
                {categories.map((category) => (
                  <div
                    key={category._id}
                    className="align-top focus:outline-none text-center inline-block"
                  >
                    <Image
                      alt="category-img"
                      onClick={() => {
                        if (ctg == category._id) {
                          setCategory("");
                          router.push(
                            `/products?page=${1}${
                              limit ? `&limit=${limit}` : ""
                            }${
                              search ? `&search=${search}` : ""
                            }${`&brand=${brand}`}${
                              sortby ? `&sortby=${sortby}` : ""
                            }${
                              instock === true ? `&instock=${instock}` : ""
                            }&#products`
                          );
                        } else {
                          setCategory(category._id);
                          router.push(
                            `/products?page=${1}${
                              limit ? `&limit=${limit}` : ""
                            }${
                              search ? `&search=${search}` : ""
                            }${`&brand=${brand}`}${`&category=${category._id}`}${
                              sortby ? `&sortby=${sortby}` : ""
                            }${
                              instock === true ? `&instock=${instock}` : ""
                            }&#products`
                          );
                        }
                      }}
                      className={
                        "px-2 mt-1 lg:h-[70px] xl:h-[85px] md:h-[60px] h-[55px] justify-center  object-contain bg-white  w-auto aspect-square  rounded-full ring-1 ring-gray-200  mx-2 hover:cursor-pointer hover:opacity-50 transition-all" +
                        (ctg === category._id ? "ring-1 ring-teal-500" : "")
                      }
                      width={500}
                      height={500}
                      src={category.image}
                    />
                    <p
                      className={
                        " text-xs md:text-sm xl:text-base lg:w-[72px] xl:w-[87px] md:w-[62px] w-[57px] font-light pl-2  overflow-hidden "
                      }
                    >
                      {category.name}
                    </p>
                  </div>
                ))}
              </Slider>
            </div>
            <div className="justify-center mt-12 mx-auto">
              <button
                className={" bg-teal-600 rounded-lg  text-white "}
                onClick={next2}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="1.5"
                  stroke="currentColor"
                  className="size-5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="m8.25 4.5 7.5 7.5-7.5 7.5"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div className="w-[90%] mt-24 mx-auto mb-8">
            <div className="flex  flex-row ">
              <h1 className="text-xl mb-2 md:text-2xl justify-center mx-auto font-semibold">
                <div className="flex ps-8 flex-row gap-2">
                  {t("marq")}
                  <select
                    value="..."
                    onChange={(ev) => {
                      if (brnd == ev.target.value) {
                        setBrand("");
                        router.push(
                          `/products?page=${1}${
                            limit ? `&limit=${limit}` : ""
                          }${search ? `&search=${search}` : ""} ${
                            category ? `&category=${category}` : ""
                          }${`&childCategory=${childCategory}`}${
                            sortby ? `&sortby=${sortby}` : ""
                          }${
                            instock === true ? `&instock=${instock}` : ""
                          }&#products`
                        );
                      } else {
                        setBrand(ev.target.value);
                        router.push(
                          `/products?page=${1}${
                            limit ? `&limit=${limit}` : ""
                          }${
                            search ? `&search=${search}` : ""
                          }${`&brand=${ev.target.value}`}${
                            category ? `&category=${category}` : ""
                          }${`&childCategory=${childCategory}`}${
                            sortby ? `&sortby=${sortby}` : ""
                          }${
                            instock === true ? `&instock=${instock}` : ""
                          }&#products`
                        );
                      }
                    }}
                    className="overflow-y-auto scale-75 text-center rounded-lg w-11 outline-none focus:outline-none aspect-square p-1 px-2 border-white bg-teal-600 text-white border-2 align-middle appearance-none -mt-2"
                  >
                    <option
                      value="..."
                      className="text-xl hidden md:text-2xl bg-white text-black"
                    >
                      ...
                    </option>
                    <option
                      value=""
                      className="  bg-white text-base text-black"
                    >
                      Tous
                    </option>
                    {brands.map((brand) => (
                      <option
                        value={brand._id}
                        key={brand._id}
                        className="bg-white text-base text-black"
                      >
                        {brand.name}
                      </option>
                    ))}
                  </select>
                </div>
              </h1>
            </div>
            <div dir="ltr" className="grid grid-cols-12 mt-4 align-middle">
              <div className=" justify-center mx-auto mt-12 ">
                <button
                  className={" bg-teal-600 rounded-lg - text-white "}
                  onClick={previous}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="1.5"
                    stroke="currentColor"
                    className="size-5"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M15.75 19.5 8.25 12l7.5-7.5"
                    />
                  </svg>
                </button>
              </div>
              <div className="col-span-10  ">
                <Slider
                  className=""
                  ref={(slider) => {
                    sliderRef = slider;
                  }}
                  {...settings2}
                >
                  {brands.map((brand) => (
                    <div key={brand._id} className="focus:outline-none">
                      <Image
                        alt="brand-img"
                        onClick={() => {
                          if (brnd == brand._id) {
                            setBrand("");
                            router.push(
                              `/products?page=${1}${
                                limit ? `&limit=${limit}` : ""
                              }${search ? `&search=${search}` : ""} ${
                                category ? `&category=${category}` : ""
                              }${`&childCategory=${childCategory}`}${
                                sortby ? `&sortby=${sortby}` : ""
                              }${
                                instock === true ? `&instock=${instock}` : ""
                              }&#products`
                            );
                          } else {
                            setBrand(brand._id);
                            router.push(
                              `/products?page=${1}${
                                limit ? `&limit=${limit}` : ""
                              }${
                                search ? `&search=${search}` : ""
                              }${`&brand=${brand._id}`}${
                                category ? `&category=${category}` : ""
                              }${`&childCategory=${childCategory}`}${
                                sortby ? `&sortby=${sortby}` : ""
                              }${
                                instock === true ? `&instock=${instock}` : ""
                              }&#products`
                            );
                          }
                        }}
                        className={
                          "justify-center focus:outline-none  w-auto md:h-[65px] xl:h-[70px] h-[45px] p-2 md:p-3 xl:p-4 mx-auto hover:cursor-pointer hover:opacity-50 rounded ring-1 ring-transparent transition-all" +
                          (brnd === brand._id
                            ? " border-2 border-teal-500 border-solid " +
                              " ring-teal-500"
                            : "")
                        }
                        width={500}
                        height={500}
                        src={brand.image}
                      />
                    </div>
                  ))}
                </Slider>
              </div>

              <div id="products" className="justify-center mt-12 mx-auto">
                <button
                  className={" bg-teal-600 rounded-lg  text-white "}
                  onClick={next}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="1.5"
                    stroke="currentColor"
                    className="size-5"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="m8.25 4.5 7.5 7.5-7.5 7.5"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div className=" mx-auto justify-between flex mt-16 flex-row">
            <div className="flex  flex-row">
              <div>
                <span className="text-sm font-medium pr-1 lg:text-lg md:text-base">
                  {t("tri")}:{" "}
                </span>{" "}
              </div>
              <select
                className="text-sm md:text-base border-b border-teal-700 mb-3 bg-transparent outline-none lg:text-lg"
                value={sortby}
                onChange={(ev) => {
                  setSortby(ev.target.value);
                  router.push(
                    `/products?page=${1}${limit ? `&limit=${limit}` : ""}${
                      search ? `&search=${search}` : ""
                    }${brand ? `&brand=${brand}` : ""}${
                      category ? `&category=${category}` : ""
                    }${`&childCategory=${childCategory}`}${`&sortby=${ev.target.value}`}${
                      instock === true ? `&instock=${instock}` : ""
                    }&#products`
                  );
                }}
              >
                <option value="novelty">{t("nv")}</option>
                <option value="price">{t("pc")}</option>
                <option value="-price">{t("pd")}</option>
                <option value="name">{t("nc")}</option>
                <option value="-name">{t("nd")}</option>
              </select>
            </div>
            <button
              className="text-sm bg-teal-700 px-1 md:px-4 py-1 rounded text-white lg:text-lg"
              onClick={() => {
                setLimit(20);
                setBrand("");
                setCategory("");
                setSortby("");
                setInStock(false);

                router.push("/products?page=1&#products");
              }}
            >
              {t("rtr")}
            </button>
          </div>
        </div>
        <Suspense>
          {" "}
          <Search2 setResults={setResults2} />
        </Suspense>
        {products?.length > 0 && (
          <div className=" grid grid-cols-2 lg:grid-cols-4 mt-12 xl:grid-cols-5 gap-3 p-5 md:w-[90%] mx-auto ">
            {products?.map((product) => (
              <div key={product._id} className="  rounded-lg relative  p-1">
                {" "}
                <Link href={"/products/" + product._id}>
                  {" "}
                  <div className="flex drop-shadow hover:drop-shadow-xl transition-all duration-500 h-[13rem] lg:h-[14rem] xl:h-[14rem] 2xl:h-[18rem] p-2 relative  bg-white rounded-xl">
                    <Image
                      src={product?.images[0]}
                      height={600}
                      width={600}
                      layout="responsive"
                      alt="product-img"
                      style={{ objectFit: "contain" }}
                    />
                  </div>
                </Link>
                <Link href={"/products/" + product._id}>
                  <h1 className="font-semibold hover:text-teal-700 transition-all duration-500 text-sm line-clamp-2 lg:text-base">
                    {t("prodt", {
                      name: product.title,
                      namear:
                        product.title_ar.length > 2
                          ? product.title_ar
                          : product.title,
                    })}
                  </h1>
                </Link>
                <span className="font-bold text-teal-700 text-sm lg:text-lg">
                  {insertDot(product.price)}
                  {t("da")}
                </span>
                <p
                  className={`text-xs font-medium mb-1 lg:text-sm pb-12 ${
                    product.stock > 0
                      ? product.stock > 5
                        ? "text-teal-700"
                        : "text-yellow-600"
                      : "text-red-600"
                  }`}
                >
                  {" "}
                  {product.stock > 0
                    ? product.stock > 5
                      ? t("es")
                      : t("mq")
                    : t("ns")}
                </p>
                {product.stock > 0 && (
                  <div className="w-full flex pb-2 justify-center px-1 absolute bottom-1 my-1.5">
                    <button
                      onClick={() => addProduct(product._id)}
                      className="bg-teal-600  text-white py-1 text-center w-10/12 rounded-full hover:bg-teal-500 transition-colors duration-200 flex px-3 flex-row"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="size-6 mx-auto"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
                        />
                      </svg>
                    </button>
                  </div>
                )}
                <div className="border-b-2  justify-center mx-auto w-full h-2 rounded-lg border-gray-400 absolute bottom-1.5"></div>
              </div>
            ))}
          </div>
        )}

        {products.length === 0 && <div className="text-center">{t("np")}</div>}
        <Pagination
          totalPages={totalPages}
          page={page}
          limit={limit}
          brnd={brand}
          ctg={category}
          srt={sortby}
          stk={instock}
          childCategory={childCategory}
        ></Pagination>
        <div className="pb-32"></div>
      </Layout>
    );
  }
}
