'use client';

import OrderForm from "../components/OrderForm";

export default function Checkout({ order = null, product = null, promoCode = null }) {
  return (
  <div className="sf-container py-6">
    <OrderForm cart={product ? false : true} prod={product} order={order} promoCode={promoCode} />
  </div>
      );
    }
