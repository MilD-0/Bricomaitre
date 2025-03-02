"use client";

import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import Image from "next/image";
import Layout from "./components/layout";
import Card from "./components/Card";
import bg1 from "../public/mecha.webp";
import bg2 from "../public/intro.webp";
import { useState, useEffect } from "react";
import Link from "next/link";
import Brand from "./components/Brand";
import Category from "./components/Category";
import { useTranslations } from "next-intl";

export default function Home() {
  const t = useTranslations("Home");

  const [featureds, setFeatureds] = useState(null);
  const [products, setProducts] = useState(null);
  const [brands, setBrands] = useState(null);
  const [featuredBrands, setFeaturedBrands] = useState(null);
  const [categories, setCategories] = useState(null);
  const [isClicked, setIsClicked] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  var settings = {
    dots: false,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    autoplay: true,
    autoplaySpeed: 3000,
    pauseOnHover: false,
  };

  var settings2 = {
    dots: true,
    arrows: false,
    infinite: true,
    speed: 500,
    slidesToShow: 4,
    swipeToSlide: true,

    slidesToScroll: 1,
    rows: 1,
    slidesPerRow: 1,
    autoplay: true,
    autoplaySpeed: 1500,
    pauseOnHover: true,
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
          initialSlide: 2,
          rows: 2,
        },
      },
    ],
  };
  useEffect(() => {
    const fetchFeatures = async () => {
      try {
        const response = await fetch("/api/featured");
        const data = await response.json();
        setFeatureds(data);
      } catch (error) {
        console.error(error);
      }
    };

    fetchFeatures();
  }, []);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await fetch("/api/featuredproducts?featured=true");
        const data = await response.json();
        setProducts(data);
        const response2 = await fetch("/api/categories?featured=true");
        const data2 = await response2.json();
        setCategories(data2);

        const response3 = await fetch("/api/brands");
        const data3 = await response3.json();
        setBrands(data3);
        const response4 = await fetch("/api/brands?featured=true");
        const data4 = await response4.json();
        setFeaturedBrands(data4);
      } catch (error) {
        console.error(error);
      }
    };

    fetchProducts();
  }, []);

  return (
    <main className="">
      <Layout className="lg:drop-shadow-lg ">
        <div className="mt-8 md:mb-16">
          <div className="mt-8 overflow-hidden">
            {featureds ? (
              <Slider {...settings}>
                {featureds.map((featured) => (
                  <div key={featured._id} className="lg:h-[52em]    min-h-52 ">
                    <Link className=" mb-1" href={featured.link}>
                      <Image
                        src={featured.image}
                        quality={50}
                        width={5000}
                        height={5000}
                        alt="featured"
                        className="shadow-md max-h-[52em] justify-center mx-auto w-auto overflow-hidden"
                      />
                    </Link>
                  </div>
                ))}
              </Slider>
            ) : (
              <div className="justify-center aspect-square  mb-4 mx-auto  max-h-[52em] h-48 md:h-full w-full md:w-[85%] flex  items-center bg-gray-300 animate-pulse ">
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
            )}
          </div>

          <h1 className="font-semibold my-4 mt-6 text-4xl lg:text-5xl text-center w-full">
            {t("maga-cat")}
          </h1>

          <div className="flex gap-4 p-4 flex-wrap">
            {" "}
            <Link
              href={"/products?category=66d9b3365a24b8c17379bac1"}
              className="w-full md:w-2/5 mx-auto"
            >
              <div
                style={{ backgroundImage: `url(${bg1.src})` }}
                className={
                  "   w-full bg-cover hover:scale-105 transform transition duration-500 bg-no-repeat md:h-72 bg-white md:w-full mx-auto p-4 m-4 max-w-xs  md:grid md:grid-cols-2 md:max-w-3xl md:gap-4 md:p-5 rounded-lg shadow-lg md:shadow-xl lg:shadow-2xl"
                }
              >
                <section>
                  <h1 className=" font-semibold text-nowrap text-lg hover:text-teal-600 transition-colors duration-300 text-white uppercase mt-2 md:text-2xl lg:text-3xl xl:text-3xl">
                    {t("maga-mec")}
                  </h1>

                  <section className="flex items-center gap-4 my-4">
                    <button className="text-lg md:text-xl  animate-[pulse_5s_ease-in-out_infinite] duration-1000  bg-teal-600  text-white py-2 px-4 rounded-full hover:bg-gradient-to-t  ">
                      {t("maga")}
                    </button>
                  </section>
                </section>
              </div>
            </Link>
            <Link
              href={"/products?category=66e357305a24b8c17379be21"}
              className="w-full md:w-2/5 mx-auto "
            >
              {" "}
              <div
                style={{ backgroundImage: `url(${bg2.src})` }}
                className={
                  " bg-cover  bg-no-repeat md:h-72 bg-white w-full hover:scale-105 transform transition duration-500 mx-auto p-4 m-4 max-w-xs  md:grid md:grid-cols-2 md:max-w-3xl md:gap-4 md:p-5 rounded-lg shadow-lg md:shadow-xl lg:shadow-2xl"
                }
              >
                <section>
                  <h1 className="font-semibold  text-lg hover:text-teal-600 transition-colors duration-300 w-full  text-white uppercase mt-2 md:text-2xl lg:text-3xl xl:text-3xl">
                    {t("maga-elec")}
                  </h1>

                  <section className="flex items-center gap-4 my-4">
                    <button className=" text-lg md:text-xl animate-[pulse_5s_ease-in-out_infinite]  bg-teal-600  text-white py-2 px-4 rounded-full hover:bg-gradient-to-t  ">
                      {t("maga")}
                    </button>
                  </section>
                </section>
              </div>
            </Link>
          </div>
          {categories &&
            categories.map((category) => (
              <Category key={category._id} categoryid={category._id} />
            ))}

          <h1 className="font-semibold text-4xl lg:text-5xl  my-4 text-center w-full">
            {t("feature")}
          </h1>
          {products && (
            <div className="flex flex-wrap gap-2 px-2">
              {products.map((product) => (
                <Card key={product._id} id={product._id} />
              ))}
            </div>
          )}

          <h1 className="font-semibold text-4xl lg:text-5xl  my-4 mt-16 text-center w-full">
            {t("maga-bra")}
          </h1>
          <div className="m-4 mb-16">
            {brands && (
              <div className="">
                <Slider
                  className="w-[90%] mx-auto justify-center"
                  {...settings2}
                >
                  {brands.map((brand) => (
                    <div key={brand._id} className="">
                      <Link
                        onMouseDown={(e) => {
                          setIsClicked(true);
                        }}
                        onMouseUp={(e) => {
                          if (!isDragging) {
                            window.location.href =
                              "/products?brand=" + brand._id;
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
                        href={`/products?brand=${brand._id}`}
                      >
                        <Image
                          alt="brand-img"
                          className="justify-center  w-auto md:h-[120px] h-[70px] p-4 mx-auto"
                          width={500}
                          height={500}
                          src={brand.image}
                        />
                      </Link>
                    </div>
                  ))}
                </Slider>
              </div>
            )}
          </div>
          {featuredBrands &&
            featuredBrands.map((featuredBrand) => (
              <Brand key={featuredBrand._id} brandid={featuredBrand._id} />
            ))}
        </div>
      </Layout>
    </main>
  );
}
