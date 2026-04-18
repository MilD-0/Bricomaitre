'use client';

import { useSearchParams } from "next/navigation";
import OrderForm from "../components/OrderForm";

export default function Checkout() {

  const searchParams = useSearchParams();
  const order = searchParams.get("order")
  const product= searchParams.get("id")

  return (


  <div className="m-4">

    <OrderForm cart={product? false : true} prod={product? product : null} order={order? order:null} />
  </div>
      );
    }