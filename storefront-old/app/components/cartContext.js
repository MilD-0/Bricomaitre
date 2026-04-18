"use client";
import { getUserLocale } from "@/i18n/locale";
import { useLocale } from "next-intl";
import { createContext, useEffect, useState } from "react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { handleAddToCart } from "./Init";

export const CartContext = createContext({});

export function CartContextProvider({ children }) {
  const ls = typeof window !== "undefined" ? window.localStorage : null;
  const [cartProducts, setCartProducts] = useState([]);
  useEffect(() => {
    if (cartProducts?.length > 0) {
      ls?.setItem("cart", JSON.stringify(cartProducts));
    }
  }, [cartProducts, ls]);
  useEffect(() => {
    if (ls && ls.getItem("cart")) {
      setCartProducts(JSON.parse(ls.getItem("cart")));
    }
  }, [ls]);
  async function addProduct(productId) {
    try {
      // Fetch full product object (for price, name, etc.)
      const res = await fetch(`/api/products?id=${productId}`);
      if (!res.ok) throw new Error("Failed to fetch product");
      const product = await res.json();
 const locale = await getUserLocale();
      // Update cart state
    setCartProducts((prev) => [...prev, productId]);

      // Fire Pixel + CAPI automatically
     handleAddToCart({ product });

      // Show toast
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
    setCartProducts([]);
  }
  function setCart() {
    const newb = ls?.getItem("cartProducts").split(",");
    if (newb.join(",") !== cartProducts.join(",")) {
      setCartProducts(newb);
    }
  }
  return (
    <CartContext.Provider
      value={{
        cartProducts,
        setCartProducts,
        addProduct,
        removeProduct,
        clearCart,
        setCart,
      }}
    >
      {children}
      <ToastContainer />
    </CartContext.Provider>
  );
}
