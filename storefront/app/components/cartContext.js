"use client";
import { createContext, useEffect, useState } from "react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { handleAddToCart } from "./Init";
import { buildItemArray, trackAnalyticsEvent } from "@/lib/analytics";
import {
  buildCartProductSummary,
  canonicalizeCartProducts,
  findProductSnapshotByToken,
  getCanonicalProductId,
  getProductReferenceTokens,
  mergeCartProductSnapshots,
  normalizeCartProductSnapshots,
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
    let snapshots = {};
    if (ls && ls.getItem("cartProductSnapshots")) {
      try {
        snapshots = normalizeCartProductSnapshots(JSON.parse(ls.getItem("cartProductSnapshots")) || {});
        setCartProductSnapshots(snapshots);
      } catch (error) {
        console.error(error);
      }
    }

    if (ls && ls.getItem("cart")) {
      try {
        const parsedCart = JSON.parse(ls.getItem("cart"));
        const nextCart = Array.isArray(parsedCart)
          ? canonicalizeCartProducts(parsedCart, Object.values(snapshots))
          : [];
        setCartProducts(nextCart);
      } catch (error) {
        console.error(error);
        setCartProducts([]);
      }
    }
  }, [ls]);

  const cartSummary = buildCartProductSummary(cartProducts, cartProductSnapshots);

  function rememberProducts(products) {
    const resolvedProducts = products.filter(Boolean);
    setCartProductSnapshots((prev) => mergeCartProductSnapshots(prev, resolvedProducts));
    setCartProducts((prev) => canonicalizeCartProducts(prev, resolvedProducts));
  }

  async function addProduct(productId, product = null, options = {}) {
    try {
      const requestedToken = String(productId ?? "").trim();
      let nextProduct = product;

      if (!requestedToken && !nextProduct) {
        throw new Error("Missing product id");
      }

      if (!nextProduct) {
        const cachedProduct = findProductSnapshotByToken(cartProductSnapshots, requestedToken);
        if (cachedProduct) {
          nextProduct = cachedProduct;
        } else {
          const res = await fetch(`/api/products?id=${encodeURIComponent(requestedToken)}`);
          if (!res.ok) throw new Error("Failed to fetch product");
          nextProduct = await res.json();
        }
      }

      const canonicalProductId = getCanonicalProductId(nextProduct);
      if (!canonicalProductId) {
        throw new Error("Product is missing a canonical numeric id");
      }

      rememberProducts([nextProduct]);
      setCartProducts((prev) => [
        ...canonicalizeCartProducts(prev, [nextProduct]),
        canonicalProductId,
      ]);

      handleAddToCart({
        product: options.trackingPrice == null
          ? nextProduct
          : { ...nextProduct, price: options.trackingPrice },
      });

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
    const requestedToken = String(productId ?? "").trim();
    const cachedProduct = findProductSnapshotByToken(cartProductSnapshots, requestedToken);
    const removalTokens = new Set([
      requestedToken,
      getCanonicalProductId(cachedProduct),
      ...getProductReferenceTokens(cachedProduct),
    ].filter(Boolean));

    void (async () => {
      try {
        const product = cachedProduct
          ?? await fetch(`/api/products?id=${encodeURIComponent(requestedToken)}`)
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

    setCartProducts((prev) => {
      const normalized = cachedProduct
        ? canonicalizeCartProducts(prev, [cachedProduct])
        : prev.map((value) => String(value));
      const pos = normalized.findIndex((value) => removalTokens.has(value));
      if (pos !== -1) {
        return normalized.filter((_value, index) => index !== pos);
      }
      return normalized;
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
    const canonical = canonicalizeCartProducts(newb, Object.values(cartProductSnapshots));
    if (canonical.join(",") !== cartProducts.join(",")) {
      setCartProducts(canonical);
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
