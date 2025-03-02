"use client";
import axios from "axios";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useEffect, useContext } from "react";
import { CartContext } from "./cartContext";
import { v4 as uuidv4 } from "uuid";
import { getCookie } from "cookies-next";
export default function OrderForm({ prod, cart, order }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const s = typeof window !== "undefined" ? window.localStorage : null;
  const id = prod;

  const { clearCart, cartProducts, setCart } = useContext(CartContext);
  let modify = false;
  order ? (modify = true) : (modify = false);
  modify && setCart();

  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(null);
  const [firstName, setFirstName] = useState(s?.getItem("firstName") || "");
  const [lastName, setLastName] = useState(s?.getItem("lastName") || "");
  const [state, setState] = useState(s?.getItem("state") || "Alger");
  const [city, setCity] = useState(s?.getItem("city") || "");
  const [homeAddress, setHomeAddress] = useState(
    s?.getItem("homeAddress") || ""
  );
  const [phoneNumber1, setPhoneNumber1] = useState(
    s?.getItem("phoneNumber1") || ""
  );
  const [phoneNumber2, setPhoneNumber2] = useState(
    s?.getItem("phoneNumber2") || ""
  );
  const [delivery, setDelivery] = useState(s?.getItem("delivery") || "home");
  const [del_pr, setDel_pr] = useState(0);
  const [products, setProducts] = useState([]);
  const [variant, setVariant] = useState("40");
  const router = useRouter();

  useEffect(() => {
    if (cart && cartProducts.length > 0) {
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
  }, [cartProducts, cart]);

  function handleMinus() {
    if (quantity > 1) {
      setQuantity(quantity - 1);
    } else null;
  }
  useEffect(() => {
    const getPrice = async () => {
      if (id) {
        try {
          const response = await fetch("/api/checkout?id=" + id);
          const data2 = await response.json();
          setPrice(data2.price);
        } catch (error) {
          console.error(error);
        }
      }
    };

    getPrice();
  }, [id]);

  useEffect(() => {
    const getPrices = async () => {
      try {
        const deliveryPrices = {
          Adrar: {
            office: 900,
            home: 1400,
          },
          Chlef: {
            office: 450,
            home: 850,
          },
          Laghouat: {
            office: 550,
            home: 950,
          },
          "Oum El Bouaghi": {
            office: 450,
            home: 850,
          },
          Batna: {
            office: 450,
            home: 900,
          },
          Béjaïa: {
            office: 450,
            home: 800,
          },
          Biskra: {
            office: 550,
            home: 950,
          },
          Béchar: {
            office: 650,
            home: 1100,
          },
          Blida: {
            office: 400,
            home: 600,
          },
          Bouïra: {
            office: 450,
            home: 700,
          },
          Tamanrasset: {
            office: 1050,
            home: 1600,
          },
          Tébessa: {
            office: 500,
            home: 900,
          },
          Tlemcen: {
            office: 500,
            home: 900,
          },
          Tiaret: {
            office: 450,
            home: 850,
          },
          "Tizi Ouzou": {
            office: 450,
            home: 750,
          },
          Alger: {
            office: 300,
            home: 500,
          },
          Djelfa: {
            office: 500,
            home: 950,
          },
          Jijel: {
            office: 450,
            home: 900,
          },
          Sétif: {
            office: 450,
            home: 800,
          },
          Saïda: {
            office: 450,
            home: 900,
          },
          Skikda: {
            office: 450,
            home: 900,
          },
          "Sidi Bel Abbès": {
            office: 450,
            home: 900,
          },
          Annaba: {
            office: 450,
            home: 850,
          },
          Guelma: {
            office: 450,
            home: 900,
          },
          Constantine: {
            office: 450,
            home: 800,
          },
          Médéa: {
            office: 450,
            home: 800,
          },
          Mostaganem: {
            office: 450,
            home: 900,
          },
          Msila: {
            office: 500,
            home: 850,
          },
          Mascara: {
            office: 450,
            home: 900,
          },
          Ouargla: {
            office: 600,
            home: 950,
          },
          Oran: {
            office: 450,
            home: 800,
          },
          "El Bayadh": {
            office: 600,
            home: 1100,
          },
          Illizi: {
            office: 0,
            home: 0,
          },
          "Bordj Bou Arreridj": {
            office: 450,
            home: 800,
          },
          Boumerdès: {
            office: 450,
            home: 700,
          },
          "El Tarf": {
            office: 450,
            home: 850,
          },
          Tindouf: {
            office: 0,
            home: 0,
          },
          Tissemsilt: {
            office: 0,
            home: 900,
          },
          "El Oued": {
            office: 600,
            home: 950,
          },
          Khenchela: {
            office: 0,
            home: 900,
          },
          "Souk Ahras": {
            office: 450,
            home: 900,
          },
          Tipaza: {
            office: 450,
            home: 700,
          },
          Mila: {
            office: 450,
            home: 900,
          },
          "Aïn Defla": {
            office: 450,
            home: 900,
          },
          Naâma: {
            office: 600,
            home: 1100,
          },
          "Aïn Témouchent": {
            office: 450,
            home: 900,
          },
          Ghardaïa: {
            office: 550,
            home: 950,
          },
          Relizane: {
            office: 450,
            home: 900,
          },
          Timimoun: {
            office: 0,
            home: 1400,
          },
          "Bordj Badji Mokhtar": {
            office: 0,
            home: 0,
          },
          "Ouled Djellal": {
            office: 550,
            home: 950,
          },
          "Béni Abbès": {
            office: 0,
            home: 1100,
          },
          "In Salah": {
            office: 0,
            home: 1600,
          },
          "In Guezzam": {
            office: 0,
            home: 1600,
          },
          Touggourt: {
            office: 600,
            home: 950,
          },
          Djanet: {
            office: 0,
            home: 0,
          },
          "El Mghair": {
            office: 0,
            home: 950,
          },
          "El Meniaa": {
            office: 0,
            home: 1000,
          },
        };
        for (const state in deliveryPrices) {
          const prices = deliveryPrices[state];
          prices.office += 70;
        }

        if (deliveryPrices[state] && deliveryPrices[state][delivery]) {
          setDel_pr(deliveryPrices[state][delivery]);
        } else {
          setDel_pr(0);
        }
      } catch (error) {
        console.error(error);
      }
    };

    getPrices();
  }, [state, delivery]);

  const t = useTranslations("checkout");

  let subtotal = 0;
  for (const productId of cartProducts) {
    const price = products.find((p) => p._id === productId)?.price || 0;
    subtotal += price;
  }

  const total = del_pr;

  async function saveOrder(ev) {
    ev.preventDefault();
    if (isSubmitting) return;
    const time = Math.floor(new Date().getTime() / 1000);
    const ev_id = uuidv4();
    setIsSubmitting(true);
    // Your form submission logic here

    // Simulate a delay for the cooldown (e.g., 2 seconds)
    setTimeout(() => {
      setIsSubmitting(false);
    }, 2000);
    const data = {
      firstName,
      lastName,
      state,
      city,
      homeAddress,
      confirmed: "nocon",
      phoneNumber1,
      phoneNumber2,
      cartProducts: cart ? cartProducts : Array(quantity).fill(id),
      delivery,
      variant,
      total,
      time,
      ev_id,
      fbp: getCookie("_fbp") ? getCookie("_fbp") : "none",
      fbc: getCookie("_fbc") ? getCookie("_fbc") : "none",
    };
    s.setItem("firstName", firstName);
    s.setItem("lastName", lastName);
    s.setItem("state", state);
    s.setItem("city", city);
    s.setItem("homeAddress", homeAddress);
    s.setItem("phoneNumber1", phoneNumber1);
    s.setItem("phoneNumber2", phoneNumber2);
    s.setItem("cartProducts", cart ? cartProducts : Array(quantity).fill(id));
    s.setItem("delivery", delivery);
    s.setItem("del_pr", del_pr);
    s.setItem("subtotal", cart ? subtotal : price * quantity);
    try {
      const response = await axios.post("/api/orders", data);

      if (response.status === 200) {
        window.fbq(
          "track",
          "Purchase",
          {
            value: total,
            currency: "DZD",
            content_type: "product",
            content_ids: cart ? cartProducts : Array(quantity).fill(id),
          },
          { eventID: ev_id }
        );
        clearCart();
        order
          ? router.push("/thank-you?modified=true")
          : router.push("/thank-you");
      } else {
        alert("Une erreur est survenue lors de la creation de la commande");
      }
    } catch (error) {
      alert("Une erreur est survenue lors de la creation de la commande");
    }
  }

  return (
    <div className="">
      <div className="    flex   text-gray-100   justify-center">
        <div
          dir="ltr"
          className="flex  bg-green-500 rounded-full font-medium text-lg px-3 py-1 align-middle"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="white"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            class="size-5 mt-1"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z"
            />
          </svg>
          :0778 81 03 60
        </div>
      </div>

      <h1 className="text-2xl font-medium mt-12 mb-5">{t("info")}:</h1>
      <form onSubmit={saveOrder}>
        <label className="text-lg  ">
          {t("nom")}
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            type="text"
            name="lastName"
            className="mt-2 mb-6 ring-1 ring-gray-300 focus:ring-black rounded-full w-full  text-lg px-2 py-2 outline-none transition-all duration-500"
            placeholder=""
          ></input>
        </label>
        <label className="text-lg  ">
          {t("pre")}
          <input
            name="firstName"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            type="text"
            className="mt-2 mb-6 ring-1 ring-gray-300 focus:ring-black rounded-full w-full  text-lg px-2 py-2 outline-none transition-all duration-500"
            placeholder=""
          ></input>
        </label>
        <label className="text-lg  ">{t("wil")}</label>
        <select
          value={state}
          onChange={(e) => setState(e.target.value)}
          className="mt-2 mb-6 ring-1 ring-gray-300  bg-transparent focus:ring-black rounded-full w-full  text-lg px-2  py-2 outline-none transition-all duration-500"
        >
          <option value="Adrar">1.{t("Adrar")}</option>
          <option value="Chlef">2.{t("Chlef")}</option>
          <option value="Laghouat">3.{t("Laghouat")}</option>
          <option value="Oum El Bouaghi">4.{t("Oum El Bouaghi")}</option>
          <option value="Batna">5.{t("Batna")}</option>
          <option value="Béjaïa">6.{t("Béjaïa")}</option>
          <option value="Biskra">7.{t("Biskra")}</option>
          <option value="Béchar">8.{t("Béchar")}</option>
          <option value="Blida">9.{t("Blida")}</option>
          <option value="Bouïra">10.{t("Bouïra")}</option>
          <option value="Tamanrasset">11.{t("Tamanrasset")}</option>
          <option value="Tébessa">12.{t("Tébessa")}</option>
          <option value="Tlemcen">13.{t("Tlemcen")}</option>
          <option value="Tiaret">14.{t("Tiaret")}</option>
          <option value="Tizi Ouzou">15.{t("Tizi Ouzou")}</option>
          <option value="Alger">16.{t("Alger")}</option>
          <option value="Djelfa">17.{t("Djelfa")}</option>
          <option value="Jijel">18.{t("Jijel")}</option>
          <option value="Sétif">19.{t("Sétif")}</option>
          <option value="Saïda">20.{t("Saïda")}</option>
          <option value="Skikda">21.{t("Skikda")}</option>
          <option value="Sidi Bel Abbès">22.{t("Sidi Bel Abbès")}</option>
          <option value="Annaba">23.{t("Annaba")}</option>
          <option value="Guelma">24.{t("Guelma")}</option>
          <option value="Constantine">25.{t("Constantine")}</option>
          <option value="Médéa">26.{t("Médéa")}</option>
          <option value="Mostaganem">27.{t("Mostaganem")}</option>
          <option value="Msila">28.{t("Msila")}</option>
          <option value="Mascara">29.{t("Mascara")}</option>
          <option value="Ouargla">30.{t("Ouargla")}</option>
          <option value="Oran">31.{t("Oran")}</option>
          <option value="El Bayadh">32.{t("El Bayadh")}</option>
          <option value="Illizi">33.{t("Illizi")}</option>
          <option value="Bordj Bou Arreridj">
            34.{t("Bordj Bou Arreridj")}
          </option>
          <option value="Boumerdès">35.{t("Boumerdès")}</option>
          <option value="El Tarf">36.{t("El Tarf")}</option>
          <option value="Tindouf">37.{t("Tindouf")}</option>
          <option value="Tissemsilt">38.{t("Tissemsilt")}</option>
          <option value="El Oued">39.{t("El Oued")}</option>
          <option value="Khenchela">40.{t("Khenchela")}</option>
          <option value="Souk Ahras">41.{t("Souk Ahras")}</option>
          <option value="Tipaza">42.{t("Tipaza")}</option>
          <option value="Mila">43.{t("Mila")}</option>
          <option value="Aïn Defla">44.{t("Aïn Defla")}</option>
          <option value="Naâma">45.{t("Naâma")}</option>
          <option value="Aïn Témouchent">46.{t("Aïn Témouchent")}</option>
          <option value="Ghardaïa">47.{t("Ghardaïa")}</option>
          <option value="Relizane">48.{t("Relizane")}</option>
          <option value="Timimoun">49.{t("Timimoun")}</option>
          <option value="Bordj Badji Mokhtar">
            50.{t("Bordj Badji Mokhtar")}
          </option>
          <option value="Ouled Djellal">51.{t("Ouled Djellal")}</option>
          <option value="Béni Abbès">52.{t("Béni Abbès")}</option>
          <option value="In Salah">53.{t("In Salah")}</option>
          <option value="In Guezzam">54.{t("In Guezzam")}</option>
          <option value="Touggourt">55.{t("Touggourt")}</option>
          <option value="Djanet">56.{t("Djanet")}</option>
          <option value="El Mghair">57.{t("El Mghair")}</option>
          <option value="El Meniaa">58.{t("El Meniaa")}</option>
        </select>
        <label className="text-lg  ">
          {t("comm")}
          <input
            value={city}
            name="city"
            onChange={(e) => setCity(e.target.value)}
            type="text"
            className="mt-2 mb-6 ring-1 ring-gray-300 focus:ring-black rounded-full w-full  text-lg px-2 py-2 outline-none transition-all duration-500"
            placeholder=""
          ></input>
        </label>
        <label className="text-lg  ">
          {t("addr")}
          <input
            value={homeAddress}
            onChange={(e) => setHomeAddress(e.target.value)}
            name="homeAddress"
            type="text"
            className="mt-2 mb-6 ring-1 ring-gray-300 focus:ring-black rounded-full w-full  text-lg px-2 py-2 outline-none transition-all duration-500"
            placeholder=""
          ></input>
        </label>
        <label className="text-lg  ">
          {t("tel")}
          <input
            required
            value={phoneNumber1}
            name="phoneNumber"
            onChange={(e) => setPhoneNumber1(e.target.value)}
            type="tel"
            className="mt-2 mb-6 ring-1 ring-gray-300 focus:ring-black rounded-full w-full  text-lg px-2 py-2 outline-none transition-all duration-500"
            placeholder=""
          ></input>
        </label>
        <label className="text-lg  ">
          {t("tel2")}
          <input
            value={phoneNumber2}
            onChange={(e) => setPhoneNumber2(e.target.value)}
            name="phoneNumber"
            type="tel"
            className="mt-2 mb-6 ring-1 ring-gray-300 focus:ring-black rounded-full w-full  text-lg px-2 py-2 outline-none transition-all duration-500"
            placeholder=""
          ></input>
        </label>
        <label className="text-lg ">{t("selec")}:</label>
        <div className="flex mt-2 gap-2 mb-2 justify-between md:mx-12">
          <label htmlFor="rad1">
            {" "}
            <div
              className={
                "   mb-2 py-2 px-1  lg:px-24 rounded-lg  hover:cursor-pointer text-center  " +
                (delivery === "home"
                  ? " bg-teal-600 text-white "
                  : "ring-1 ring-black")
              }
            >
              <input
                type="radio"
                className="appearance-none"
                id="rad1"
                name="livraison"
                value="home"
                onChange={(e) => setDelivery(e.target.value)}
              />
              <span className=" font-medium">{t("dom")}</span>
            </div>
          </label>
          <label htmlFor="rad2">
            <div
              className={
                "   mb-2 py-2 px-2     lg:px-24 rounded-lg   text-center hover:cursor-pointer  " +
                (delivery === "office"
                  ? " bg-teal-600 text-white "
                  : " ring-1 ring-black")
              }
            >
              <input
                type="radio"
                className="appearance-none"
                id="rad2"
                name="livraison"
                value="office"
                onChange={(e) => setDelivery(e.target.value)}
              />
              <span className=" font-medium">{t("off")}</span>
            </div>
          </label>
        </div>
        {id && id === "f00000000000000000000002" && (
          <div className="mt-6">
            <label className="text-lg ">{t("selec2")}:</label>
            <div className="text-center">
              <label className="text-2xl">{t("size")}: </label>
              <select
                value={variant}
                onChange={(e) => setVariant(e.target.value)}
                className="mt-2 mb-6 ring-1 ring-gray-300  bg-transparent focus:ring-black rounded-full   text-xl px-1  py-1 outline-none transition-all duration-500"
              >
                {" "}
                <option value="39">39</option>
                <option value="40">40</option>
                <option value="41">41</option>
                <option value="42">42</option>
                <option value="43">43</option>
                <option value="44">44</option>
                <option value="45">45</option>
                <option value="46">46</option>
              </select>
            </div>
          </div>
        )}

        {!cart && (
          <div>
            <label className="text-lg  ">{t("quant")}:</label>
            <div
              dir="ltr"
              class="inline-flex mt-4 rounded-full w-full justify-center mx-auto items-center"
            >
              <button
                type="button"
                onClick={() => handleMinus()}
                class="ring-1 text-3xl  text-center w-1/4 ring-slate-300 bg-teal-600 text-white  font-bold py-2 px-4 rounded-l-full"
              >
                -
              </button>
              <div class="border-y-2 text-3xl w-1/4 text-center border-slate-300 font-bold py-[6.5px] px-4">
                {quantity}
              </div>
              <button
                type="button"
                onClick={() => setQuantity(quantity + 1)}
                class="ring-1 text-3xl  text-center w-1/4 ring-slate-300 bg-teal-600 text-white  font-bold py-2 px-4 rounded-r-full"
              >
                +
              </button>
            </div>
          </div>
        )}
        <div className="flex border-b border-emerald-700 justify-between mb-2 mt-6">
          <span className=" font-semibold text-lg ">{t("sous")}:</span>
          <span className=" font-bold text-lg text-emerald-700 ">
            {cart ? subtotal : price * quantity}
            {t("da")}
          </span>
        </div>
        {del_pr > -1 ? (
          <div>
            <div className="flex border-b border-emerald-700 justify-between mb-2">
              <span className=" font-semibold text-lg">{t("liv")}:</span>
              <span className=" font-bold text-lg text-emerald-700">
                {del_pr}
                {t("da")}
              </span>
            </div>
            <div className="flex border-b border-emerald-700 justify-between mb-2">
              <span className=" font-semibold text-lg">{t("tot")}:</span>
              <span className=" font-bold text-lg text-emerald-700">
                {cart ? subtotal + del_pr : price + del_pr}
                {t("da")}
              </span>
            </div>
          </div>
        ) : (
          <span className=" font-semibold text-red-500">{t("pd")}</span>
        )}

        {del_pr > 70 ? (
          <div className="flex text-center text-white m-2 mt-6">
            {order ? (
              <button
                type="submit"
                className="bg-teal-600 px-6 py-2 w-full rounded-lg text-xl font-semibold"
              >
                {t("modi")}{" "}
              </button>
            ) : (
              <button
                type="submit"
                className="bg-teal-600 px-6 py-2 w-full rounded-lg text-xl font-semibold"
              >
                {" "}
                {t("conf")}
              </button>
            )}
          </div>
        ) : null}
      </form>
    </div>
  );
}
