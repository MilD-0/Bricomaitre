"use client";
import axios from "axios";
import { useEffect, useState } from "react";
import Swal from "sweetalert2";

import Layout from "../components/layout";

export default function Orders(order) {
  const [copied, setCopied] = useState(false);
  const [orderNotes, setOrderNotes] = useState({});

  const handleCopy = (order) => {
    navigator.clipboard.writeText(order.firstName + " " + order.lastName);
    setCopied((prevCopied) => ({ ...prevCopied, [order._id]: true }));
    setTimeout(() => {
      setCopied((prevCopied) => ({ ...prevCopied, [order._id]: false }));
    }, 2000);
  };
  async function updateNote(order) {
    await axios.put("/api/orders?id=" + order._id, {
      ...order,
      note: orderNotes[order._id],
    });
    await axios.get("/api/orders").then((response) => {
      setOrders(response.data);
    });
  }

  function calculateSubtotal(order) {
    const subtotal = order.cartProducts.reduce((total, productId) => {
      const product = products.find((p) => p._id === productId);
      return total + (product ? product.price : 0);
    }, 0);
    return subtotal;
  }
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    axios.get("/api/orders").then((response) => {
      setOrders(response.data);
    });
  }, []);
  const [products, setProducts] = useState([]);
  useEffect(() => {
    axios.get("/api/products").then((response) => {
      setProducts(response.data);
    });
  }, []);
  useEffect(() => {
    // Initially, populate the state with the current notes from the orders.
    const initialNotes = orders.reduce((acc, order) => {
      acc[order._id] = order.note;
      return acc;
    }, {});
    setOrderNotes(initialNotes);
  }, [orders]);
  function deleteOrder(order) {
    Swal.fire({
      title: "Confirmation",
      text: `Supprimer ?`,
      showCancelButton: true,
      cancelButtonText: "Non",
      confirmButtonText: "Oui",
      confirmButtonColor: "#d55",
      background: "#e5e7eb",
      reverseButtons: true,
      icon: "question",
    }).then(async (result) => {
      if (result.isConfirmed) {
        const { _id } = order;
        await axios.delete("/api/orders?id=" + _id);

        axios.get("/api/orders").then((response) => {
          setOrders(response.data);
        });
      }
    });
  }

  const [filter, setFilter] = useState({
    confirmed: "",
  });

  const handleFilterChange = (ev) => {
    const { value } = ev.target;
    setFilter({ confirmed: value });
  };
  const filteredOrders = orders.filter((order) => {
    if (filter.confirmed === "nocon") {
      return !order.confirmed || order.confirmed == "no";
    } else if (filter.confirmed === "") {
      return orders;
    } else return order.confirmed === filter.confirmed;
  });

  function calculateDeliveryPrice(order) {
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
    const state = order.state;
    const delivery = order.delivery;
    const price = deliveryPrices[state][delivery];
    order.del_pr = price;
    // Update the delivery price in the order object
    return price;
    // Update the UI with the new delivery price
    // ...
  }

  return (
    <Layout>
      <h1 className="titel">Page des Commandes</h1>

      <select value={filter.confirmed} onChange={handleFilterChange}>
        <option value="">Tous</option>
        <option value="nocon">pas contacté</option>
        <option value="no2">sans response</option>
        <option value="yes">confirmée</option>
        <option value="dispatched">expédié</option>
        <option value="delivered">livrée</option>
        <option value="delayed">raportée</option>
        <option value="complete">complétée</option>
        <option value="cancelled">annulée</option>
      </select>

      <table className="basic">
        <thead>
          <tr>
            <td>Date</td>
            <td>Information du client</td>
            <td>Produits</td>
            <td>Adresse</td>
            <td>Information de commande</td>

            <td>Confiramtion</td>
            <td>Notes</td>
            <td>Supprimer</td>
          </tr>
        </thead>
        <tbody>
          {filteredOrders.map((order, index) => (
            <tr key={index}>
              <td>{new Date(order.createdAt).toLocaleString()}</td>
              <td>
                {order.firstName} {order.lastName}{" "}
                <button onClick={() => handleCopy(order)}>
                  {copied[order._id] ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke-width="1.5"
                      stroke="currentColor"
                      class="size-6"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75"
                      />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke-width="1.5"
                      stroke="currentColor"
                      class="size-6"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"
                      />
                    </svg>
                  )}
                </button>
                <br></br>0{order.phoneNumber1}
                <a className="md:hidden" href={`tel:0${order.phoneNumber1}`}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="1.5"
                    stroke="currentColor"
                    class="size-6"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z"
                    />
                  </svg>
                </a>{" "}
                <br></br>{" "}
                {order.phoneNumber2 && (
                  <a className="md:hidden" href={`tel:0${order.phoneNumber2}`}>
                    0{order.phoneNumber2}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke-width="1.5"
                      stroke="currentColor"
                      class="size-6"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z"
                      />
                    </svg>
                  </a>
                )}
              </td>
              <td>
                {order.cartProducts.map((productId, index) => {
                  const product = products.find((p) => p._id === productId);
                  return product ? (
                    <div key={product._id + index}>
                      {product.title}:{product.price}DA<br></br>
                      {product._id === "f00000000000000000000001" &&
                        order.variant.length > 1 && (
                          <select
                            onChange={async (ev) => {
                              order.variant = ev.target.value;
                              await axios.put("/api/orders?id=" + order._id, {
                                ...order,
                                variant: ev.target.value,
                              });
                              axios.get("/api/orders").then((response) => {
                                setOrders(response.data);
                              }); // Call calculateDeliveryPrice after updating the delivery method
                            }}
                            value={order.variant}
                          >
                            {order.variant}
                            <option value="39">39</option>
                            <option value="40">40</option>
                            <option value="41">41</option>
                            <option value="42">42</option>
                            <option value="43">43</option>
                            <option value="44">44</option>
                            <option value="45">45</option>
                            <option value="46">46</option>
                          </select>
                        )}
                    </div>
                  ) : null;
                })}
              </td>
              <td>
                <select
                  value={order.state}
                  onChange={async (ev) => {
                    order.state = ev.target.value;
                    calculateDeliveryPrice(order);
                    await axios.put("/api/orders?id=" + order._id, {
                      ...order,
                      state: ev.target.value,
                    });
                    axios.get("/api/orders").then((response) => {
                      setOrders(response.data);
                    }); // Call calculateDeliveryPrice after updating the delivery method
                  }}
                  className=""
                >
                  <option value="Adrar">Adrar</option>
                  <option value="Chlef">Chlef</option>
                  <option value="Laghouat">Laghouat</option>
                  <option value="Oum El Bouaghi">Oum El Bouaghi</option>
                  <option value="Batna">Batna</option>
                  <option value="Béjaïa">Béjaïa</option>
                  <option value="Biskra">Biskra</option>
                  <option value="Béchar">Béchar</option>
                  <option value="Blida">Blida</option>
                  <option value="Bouïra">Bouïra</option>
                  <option value="Tamanrasset">Tamanrasset</option>
                  <option value="Tébessa">Tébessa</option>
                  <option value="Tlemcen">Tlemcen</option>
                  <option value="Tiaret">Tiaret</option>
                  <option value="Tizi Ouzou">Tizi Ouzou</option>
                  <option value="Alger">Alger</option>
                  <option value="Djelfa">Djelfa</option>
                  <option value="Jijel">Jijel</option>
                  <option value="Sétif">Sétif</option>
                  <option value="Saïda">Saïda</option>
                  <option value="Skikda">Skikda</option>
                  <option value="Sidi Bel Abbès">Sidi Bel Abbès</option>
                  <option value="Annaba">Annaba</option>
                  <option value="Guelma">Guelma</option>
                  <option value="Constantine">Constantine</option>
                  <option value="Médéa">Médéa</option>
                  <option value="Mostaganem">Mostaganem</option>
                  <option value="Msila">Msila</option>
                  <option value="Mascara">Mascara</option>
                  <option value="Ouargla">Ouargla</option>
                  <option value="Oran">Oran</option>
                  <option value="El Bayadh">El Bayadh</option>
                  <option value="Illizi">Illizi</option>
                  <option value="Bordj Bou Arreridj">Bordj Bou Arreridj</option>
                  <option value="Boumerdès">Boumerdès</option>
                  <option value="El Tarf">El Tarf</option>
                  <option value="Tindouf">Tindouf</option>
                  <option value="Tissemsilt">Tissemsilt</option>
                  <option value="El Oued">El Oued</option>
                  <option value="Khenchela">Khenchela</option>
                  <option value="Souk Ahras">Souk Ahras</option>
                  <option value="Tipaza">Tipaza</option>
                  <option value="Mila">Mila</option>
                  <option value="Aïn Defla">Aïn Defla</option>
                  <option value="Naâma">Naâma</option>
                  <option value="Aïn Témouchent">Aïn Témouchent</option>
                  <option value="Ghardaïa">Ghardaïa</option>
                  <option value="Relizane">Relizane</option>
                  <option value="Timimoun">Timimoun</option>
                  <option value="Bordj Badji Mokhtar">
                    Bordj Badji Mokhtar
                  </option>
                  <option value="Ouled Djellal">Ouled Djellal</option>
                  <option value="Béni Abbès">Béni Abbès</option>
                  <option value="In Salah">In Salah</option>
                  <option value="In Guezzam">In Guezzam</option>
                  <option value="Touggourt">Touggourt</option>
                  <option value="Djanet">Djanet</option>
                  <option value="El Mghair">El Mghair</option>
                  <option value="El Meniaa">El Meniaa</option>
                </select>
                , {order.city},<br></br> {order.homeAddress}
              </td>
              <td>
                <select
                  onChange={async (ev) => {
                    order.delivery = ev.target.value;
                    calculateDeliveryPrice(order);
                    await axios.put("/api/orders?id=" + order._id, {
                      ...order,
                      delivery: ev.target.value,
                    });
                    axios.get("/api/orders").then((response) => {
                      setOrders(response.data);
                    }); // Call calculateDeliveryPrice after updating the delivery method
                  }}
                  value={order.delivery}
                >
                  {order.delivery}
                  <option value="home">home</option>
                  <option value="office">office</option>
                </select>
                <br></br>
                PP:{calculateSubtotal(order)}DA<br></br>
                PL:{order.del_pr ? order.del_pr : calculateDeliveryPrice(order)}
                DA<br></br>
                PT:{calculateSubtotal(order) + order.del_pr}DA
              </td>
              <td>
                <select
                  className="  mb-3 bg-transparent  lg:text-lg"
                  value={order.confirmed}
                  onChange={async (ev) => {
                    order.confirmed = ev.target.value;
                    await axios.put("/api/orders?id=" + order._id, {
                      ...order,
                      confirmed: ev.target.value,
                    });
                    axios.get("/api/orders").then((response) => {
                      setOrders(response.data);
                    });
                  }}
                >
                  <option value="nocon">pas contacté</option>
                  <option value="no2">sans response</option>
                  <option value="yes">confirmée</option>
                  <option value="dispatched">expédié</option>
                  <option value="delivered">livrée</option>
                  <option value="delayed">raportée</option>
                  <option value="complete">complétée</option>
                  <option value="cancelled">annulée</option>
                </select>
              </td>
              <td className="w-60">
                <div className=" relative flex flex-col">
                  <input
                    onKeyDown={(e) =>
                      e.key === "Enter" ? updateNote(order) : null
                    }
                    className=" text-wrap py-1"
                    type="text"
                    value={orderNotes[order._id] || ""}
                    onChange={async (ev) => {
                      setOrderNotes((prev) => ({
                        ...prev,
                        [order._id]: ev.target.value, // Only update the note for this specific order
                      }));
                    }}
                  ></input>
                  <div className="flex-row  ">
                    <button
                      onClick={() => updateNote(order)}
                      className=" mx-2 p-1 rounded-md -py-0 bg-emerald-500 text-white"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        class="size-6"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M19.916 4.626a.75.75 0 0 1 .208 1.04l-9 13.5a.75.75 0 0 1-1.154.114l-6-6a.75.75 0 0 1 1.06-1.06l5.353 5.353 8.493-12.74a.75.75 0 0 1 1.04-.207Z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    </button>
                    <button
                      className="mx-2 p-1 rounded-md -py-0 bg-emerald-500 text-white"
                      onClick={() => {
                        Swal.fire({
                          text: order.note,
                        });
                      }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="size-6"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M12 4.5v15m7.5-7.5h-15"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </td>
              <td>
                <button onClick={() => deleteOrder(order)} className="del">
                  <svg
                    className=" w-5 h-5"
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
                      d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                    />
                  </svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Layout>
  );
}
