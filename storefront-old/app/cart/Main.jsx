"use client";
import Layout from "../components/layout";
import { useContext, useEffect, useState } from "react";
import { CartContext } from "../components/cartContext";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { handleInitiateCheckout } from "../components/Init";
import { useRouter, useSearchParams } from "next/navigation";

function waitForTracking(promise, timeoutMs = 250) {
  return Promise.race([
    promise.catch((error) => {
      console.error("InitiateCheckout error:", error);
    }),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
function CartPage() {
  const t = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { cartProducts, addProduct, removeProduct, clearCart } =
    useContext(CartContext);
  const [products, setProducts] = useState([]);
  const checkoutHref = (() => {
    const query = searchParams?.toString() ?? "";
    return query ? `/checkout?${query}` : "/checkout";
  })();
  async function goToCheckout() {
    await waitForTracking(handleInitiateCheckout({
      products,
      totalValue: total,
    }));
    router.push(checkoutHref);
  }
  console.log(cartProducts);

  useEffect(() => {
    if (cartProducts.length > 0) {
      fetch("/api/cart", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: cartProducts }),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error("Failed to fetch products");
          }
          return response.json();
        })
        .then((data) => {
          setProducts(data);
        })
        .catch((error) => {
          console.error(error);
        });
    } else {
      setProducts([]);
    }
  }, [cartProducts]);
  function moreOfThisProduct(id) {
    addProduct(id);
  }
  function lessOfThisProduct(id) {
    removeProduct(id);
  }
  let total = 0;
  for (const productId of cartProducts) {
    const price = products.find((p) => p._id === productId)?.price || 0;
    total += price;
  }
  if (!cartProducts?.length) {
    return (
      <Layout>
        <h1 className="text-lg font-semibold mb-3 mt-6 mx-2">{t("pdp")}...</h1>
        <div className="flex text-center text-white m-2 ">
          <Link
            href={"/products"}
            className="bg-teal-600 px-6 py-2 w-full rounded-lg text-xl font-semibold mb-2"
          >
            {t("vrd")}
          </Link>
        </div>
      </Layout>
    );
  } else
    return (
      <Layout>
        {cartProducts?.length && (
          <div className="mb-20  md:w-[90%] lg:w-[70%] xl:w-[50%] mx-auto">
            <div className="flex text-center  text-white m-2 ">
              <div className="w-full">
                <button
                onClick={() => {
                  void goToCheckout();
                }}
                className="bg-teal-600 px-6 py-2 w-full rounded-lg text-xl mt-2 font-semibold mb-2"
              >
                {t("ent")}
              </button>
              </div>
            </div>
            <div className="flex border-b border-emerald-700 justify-between mb-2">
              <span className=" font-semibold text-lg ">{t("sous")}:</span>
              <span className=" font-bold text-lg text-emerald-700 ">
                {total}
                {t("da")}
              </span>
            </div>

            {products.map((product) => (
              <div
                key={product._id}
                className="grid grid-cols-3 m-2 p-1 shadow-sm md:shadow-md  md:p-4  lg:w-full  border-b bg-gray-100 rounded-lg  border-solid border-gray-300"
              >
                <Link href={`/products/${product._id}`}>
                  <Image
                    src={product.images[0]}
                    alt="product image"
                    width={120}
                    height={120}
                    className="mt-1"
                  />
                </Link>
                <div className="col-span-2 mx-2 ">
                  <div className=" font-semibold text-sm ">
                    {t("prodt", {
                      name: product.title,
                      namear:
                        product.title_ar.length > 2
                          ? product.title_ar
                          : product.title,
                    })}
                  </div>
                  <div className="">
                    <span className="font-bold text-md text-emerald-700 ">
                      {product.price}
                      {t("da")}
                    </span>
                  </div>
                </div>
                <div className="flex-col col-end-5  h-full items-center text-center mt-1">
                  <button
                    onClick={() => moreOfThisProduct(product._id)}
                    className=" text-teal-600 rounded-full p-1 ring-1 ring-teal-600 "
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke-width="1.5"
                      stroke="currentColor"
                      class="size-5"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M12 4.5v15m7.5-7.5h-15"
                      />
                    </svg>
                  </button>
                  <div className="text-lg font-meduim">
                    {cartProducts.filter((id) => id === product._id).length}
                  </div>
                  <button
                    onClick={() => lessOfThisProduct(product._id)}
                    className=" text-teal-600 rounded-full p-1 ring-1 ring-teal-600 "
                  >
                    {cartProducts.filter((id) => id === product._id).length ===
                    1 ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="#f3f4f6"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="size-5 "
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                        />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="size-5"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M5 12h14"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Layout>
    );
}

export default CartPage;
