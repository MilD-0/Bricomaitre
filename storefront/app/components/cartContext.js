"use client";
import { createContext, useEffect, useState } from "react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { handleAddToCart } from "./Init";
import { buildItemArray, trackAnalyticsEvent } from "@/lib/analytics";
import {
  buildCartProductSummary,
  mergeCartProductSnapshots,
} from "@/lib/cart-state";

export const CartContext = createContext({});

export function CartContextProvider({ children, locale }) {
  const ls = typeof window !== "undefined" ? window.localStorage : null;
  const [cartProducts, setCartProducts] = useState([]);
  const [cartProductSnapshots, setCartProductSnapshots] = useState({});

  useEffect(() => {
    if (cartProducts?.length > 0) {
      ls?.setItem("cart", JSON.stringify(cartProducts));
      return;
    }

    ls?.removeItem("cart");
  }, [cartProducts, ls]);

  useEffect(() => {
    ls?.setItem("cartProductSnapshots", JSON.stringify(cartProductSnapshots));
  }, [cartProductSnapshots, ls]);

  useEffect(() => {
    if (ls && ls.getItem("cart")) {
      setCartProducts(JSON.parse(ls.getItem("cart")));
    }

    if (ls && ls.getItem("cartProductSnapshots")) {
      try {
        setCartProductSnapshots(JSON.parse(ls.getItem("cartProductSnapshots")) || {});
      } catch (error) {
        console.error(error);
      }
    }
  }, [ls]);

  const cartSummary = buildCartProductSummary(cartProducts, cartProductSnapshots);

  function rememberProducts(products) {
    setCartProductSnapshots((prev) => mergeCartProductSnapshots(prev, products));
  }

  async function addProduct(productId, product = null) {
    try {
      let nextProduct = product;

      if (!nextProduct) {
        const cachedProduct = cartProductSnapshots[String(productId)];
        if (cachedProduct) {
          nextProduct = cachedProduct;
        } else {
          const res = await fetch(`/api/products?id=${productId}`);
          if (!res.ok) throw new Error("Failed to fetch product");
          nextProduct = await res.json();
        }
      }

      rememberProducts([nextProduct]);
      setCartProducts((prev) => [...prev, productId]);

      handleAddToCart({ product: nextProduct });

      toast.success(
        locale == "ar" ? "تمت الإضافة إلى السلة." : "Produit ajouté."
      );
    } catch (err) {
      console.error(err);
      toast.error(
        locale == "ar" ? "حدث خطأ أثناء إضافة المنتج." : "Erreur lors de l'ajout du produit."
      );
    }
  }

  // Remove product by ID
  function removeProduct(productId) {
    void (async () => {
      try {
        const product = cartProductSnapshots[String(productId)]
          ?? await fetch(`/api/products?id=${productId}`)
            .then((res) => (res.ok ? res.json() : null));
        if (!product) return;
        const analyticsItem = buildItemArray([product])[0];
        await trackAnalyticsEvent({
          eventName: "remove_from_cart",
          gaEventName: "remove_from_cart",
          productId: analyticsItem.productId ?? null,
          productSlug: analyticsItem.productSlug ?? null,
          categoryId: analyticsItem.categoryId ?? null,
          categorySlug: analyticsItem.categorySlug ?? null,
          brandId: analyticsItem.brandId ?? null,
          brandSlug: analyticsItem.brandSlug ?? null,
          quantity: 1,
          value: typeof product.price === "number" ? product.price : Number(product.price ?? 0),
          metadata: { items: [analyticsItem] },
          gaParams: {
            currency: "DZD",
            value: typeof product.price === "number" ? product.price : Number(product.price ?? 0),
            items: [analyticsItem],
          },
        });
      } catch (error) {
        console.error(error);
      }
    })();

    if (cartProducts?.length === 1) {
      localStorage.removeItem("cart");
      setCartProducts([]);
    }
    setCartProducts((prev) => {
      const pos = prev.indexOf(productId);
      if (pos !== -1) {
        return prev.filter((value, index) => index !== pos);
      }
      return prev;
    });
  }
  function clearCart() {
    localStorage.removeItem("cart");
    localStorage.removeItem("cartProductSnapshots");
    setCartProducts([]);
    setCartProductSnapshots({});
  }
  function setCart() {
    const newb = ls?.getItem("cartProducts")?.split(",").filter(Boolean) ?? [];
    if (newb.join(",") !== cartProducts.join(",")) {
      setCartProducts(newb);
    }
  }
  return (
    <CartContext.Provider
      value={{
        cartProducts,
        setCartProducts,
        cartProductSnapshots,
        cartSummary,
        addProduct,
        removeProduct,
        clearCart,
        setCart,
        rememberProducts,
      }}
    >
      {children}
      <ToastContainer />
    </CartContext.Provider>
  );
}
