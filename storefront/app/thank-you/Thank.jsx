"use client";
import Layout from "../components/layout";
import Card from "../components/Card";
import Brand from "../components/Brand";
import Category from "../components/Category";
import { useContext, useEffect, useMemo, useState } from "react";
import { CartContext } from "../components/cartContext";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";

export default function ThankYou({ modified = false }) {
  const storage = typeof window !== "undefined" ? window.localStorage : null;
  const { clearCart, cartProductSnapshots, rememberProducts } = useContext(CartContext);
  const bought = useMemo(
    () => storage?.getItem("cartProducts")?.split(",").filter(Boolean) ?? [],
    [storage],
  );
  const t = useTranslations("thx");
  const f = useTranslations("common");
  const c = useTranslations("checkout");

  const [featuredBrands, setFeaturedBrands] = useState(null);
  const [categories, setCategories] = useState(null);
  const [products, setProducts] = useState(null);
  const [prods, setProds] = useState([]);

  useEffect(() => {
    if (modified) {
      clearCart();
    }
  }, [clearCart, modified]);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await fetch("/api/featuredproducts?featured=true");
        const data = await response.json();
        setProducts(data);
        const response2 = await fetch("/api/categories?featured=true");
        const data2 = await response2.json();
        setCategories(data2);
        const response4 = await fetch("/api/brands?featured=true");
        const data4 = await response4.json();
        setFeaturedBrands(data4);
      } catch (error) {
        console.error(error);
      }
    };

    fetchProducts();
  }, []);

  useEffect(() => {
    const snapshotProducts = bought
      .map((productId) => cartProductSnapshots[productId] ?? null)
      .filter((product, index, products) =>
        Boolean(product) && products.findIndex((entry) => entry?._id === product?._id) === index,
      );

    if (snapshotProducts.length > 0) {
      setProds(snapshotProducts);
    }

    if (bought.length === 0) {
      setProds([]);
      return;
    }

    fetch("/api/cart", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids: bought }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to fetch products");
        }
        return response.json();
      })
      .then((data) => {
        rememberProducts(data);
        setProds(data);
      })
      .catch((error) => {
        console.error(error);
      });
  }, [bought, cartProductSnapshots, rememberProducts]);

  return (
    <Layout>
      <div className="sf-container space-y-8 py-6">
        <section className="sf-panel text-center">
          <p className="sf-kicker">{t("mrc")}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">{t("mrc")}</h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Votre commande a bien ete enregistree. Les details ci-dessous permettent de la verifier rapidement.
          </p>
        </section>

        {prods?.length ? (
          <section className="sf-panel">
            <h2 className="text-2xl font-semibold text-slate-900">{c("info")}</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {prods.map((product) => (
                <article key={product._id} className="grid grid-cols-[96px_1fr] gap-4 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                  <Link target="_blank" href={`/products/${product.slug}`} className="sf-image-frame aspect-square p-2">
                    <Image
                      src={product.images[0]}
                      alt="product image"
                      width={140}
                      height={140}
                      className="h-full w-full object-contain"
                      sizes="96px"
                    />
                  </Link>
                  <Link target="_blank" href={`/products/${product.slug}`} className="min-w-0">
                    <div className="line-clamp-2 text-sm font-semibold text-slate-900">
                      {f("prodt", {
                        name: product.title,
                        namear: product.title_ar.length > 2 ? product.title_ar : product.title,
                      })}
                    </div>
                    <div className="mt-2 text-lg font-bold text-teal-700">
                      {product.price}
                      {f("da")}
                    </div>
                    <div className="mt-2 text-sm text-slate-600">
                      {c("quant")}: {bought.filter((id) => id === product._id).length}
                    </div>
                  </Link>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="sf-panel">
          <h2 className="text-2xl font-semibold text-slate-900">{c("info")}</h2>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {storage?.getItem("firstName") ? <p><span className="font-semibold">{c("nom")}:</span> {storage.getItem("firstName")} {storage.getItem("lastName")}</p> : null}
            {storage?.getItem("state") ? <p><span className="font-semibold">{c("wil")}:</span> {storage.getItem("state")}</p> : null}
            {storage?.getItem("city") ? <p><span className="font-semibold">{c("comm")}:</span> {storage.getItem("city")}</p> : null}
            {storage?.getItem("homeAddress") ? <p><span className="font-semibold">{c("addr")}:</span> {storage.getItem("homeAddress")}</p> : null}
            <p><span className="font-semibold">{c("tel")}:</span> {storage?.getItem("phoneNumber1")}</p>
            {storage?.getItem("phoneNumber2") ? <p><span className="font-semibold">{c("tel2")}:</span> {storage.getItem("phoneNumber2")}</p> : null}
            <p><span className="font-semibold">{c("livr")}:</span> {storage?.getItem("delivery") == "home" ? c("lv1") : c("lv2")}</p>
            <p><span className="font-semibold">{c("liv")}:</span> <span className="font-semibold text-teal-700">{storage?.getItem("del_pr")}{c("da")}</span></p>
            <p><span className="font-semibold">{c("sous")}:</span> <span className="font-semibold text-teal-700">{storage?.getItem("subtotal")}{c("da")}</span></p>
            <p><span className="font-semibold">{c("tot")}:</span> <span className="font-semibold text-teal-700">{Number(storage?.getItem("del_pr")) + Number(storage?.getItem("subtotal"))}{c("da")}</span></p>
          </div>
        </section>

        <div className="flex flex-col gap-3 md:flex-row">
          <Link href="/checkout?order=1" className="sf-button w-full justify-center md:w-auto">
            {c("modi")}
          </Link>
          <Link href="/products" className="sf-button-secondary w-full justify-center md:w-auto">
            {t("vp")}
          </Link>
        </div>

        <section>
          <div className="sf-container px-0 text-center">
            <h2 className="sf-title text-3xl">{t("va")}:</h2>
          </div>
          {products ? (
            <div className="mt-6 flex flex-wrap gap-4">
              {products.map((product) => (
                <Card key={product._id} id={product._id} />
              ))}
            </div>
          ) : null}
        </section>
      </div>

      {featuredBrands && featuredBrands.map((featuredBrand) => (
        <Brand key={featuredBrand._id} brandid={featuredBrand._id} />
      ))}
      {categories && categories.map((category) => (
        <Category key={category._id} categoryid={category._id} />
      ))}
    </Layout>
  );
}
