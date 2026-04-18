"use client"

import Layout from "@/app/components/layout";

import Image from "next/image";
import Link from "next/link";
import Logo from "@/app/components/logo";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useState, useEffect, useContext } from "react";
import Carousel from "@/app/components/Carousel";
import { CartContext } from "@/app/components/cartContext";
import {
  findDeliveryFee,
  getCommunesForWilaya,
} from "@/lib/storefront-api";




export default function Cle () {

    const [product, setProduct] = useState(null);
    const {addProduct} = useContext(CartContext);
    const [brand,setBrand] = useState(null);


    const shareData = {
      title: "Produit Bricomaitre",
      url: "https://bricomaitre.com/landing/cles-a-chocs",
    };
    const price = 3850
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [state, setState] = useState("Alger");
    const [city, setCity] = useState("");
    const [homeAddress, setHomeAddress] = useState("");
    const [email, setEmail] = useState("");
    const [phoneNumber1, setPhoneNumber1] = useState("");
    const [phoneNumber2, setPhoneNumber2] = useState("");
    const [delivery, setDelivery] = useState("home");
    const [deliveryCatalog, setDeliveryCatalog] = useState(null);
    const [selectedWilayaId, setSelectedWilayaId] = useState(16);
    const router = useRouter();
    useEffect(() => {

        const fetchProduct = async () => {
          try {
            const response = await fetch(`/api/products?id=66c241e74dce7eb9f52f8b5e`);
            const data = await response.json();
            setProduct(data);
          if (data.brand) {
            const response2 = await fetch(`/api/brando?id=${data.brand}`);
            const data2 = await response2.json();
            setBrand(data2);}

          } catch (error) {
            console.error(error);
          }
        };

        fetchProduct();

      },[]);

    useEffect(() => {
      const loadCatalog = async () => {
        try {
          const response = await fetch("/api/ecotrack/catalog");
          if (!response.ok) {
            throw new Error("Failed to load Ecotrack catalog");
          }

          setDeliveryCatalog(await response.json());
        } catch (error) {
          console.error(error);
        }
      };

      loadCatalog();
    }, []);

      const availableCommunes = getCommunesForWilaya(deliveryCatalog, selectedWilayaId);
      const selectedCommune =
        availableCommunes.find((commune) => commune.name === city) ?? null;
      const officeAvailable = selectedCommune ? selectedCommune.hasStopDesk : true;

      useEffect(() => {
        if (city && !availableCommunes.some((commune) => commune.name === city)) {
          setCity("");
        }
      }, [availableCommunes, city]);

      useEffect(() => {
        if (delivery === "office" && city && !officeAvailable) {
          setDelivery("home");
        }
      }, [city, delivery, officeAvailable]);

      const del_pr = findDeliveryFee(deliveryCatalog, selectedWilayaId, delivery);

      async function saveOrder(ev) {
        ev.preventDefault();
        const data = {
          firstName,
          lastName,
          state: selectedWilayaId ?? state,
          city,
          homeAddress,
          email,
          phoneNumber1,
          phoneNumber2,
          cartProducts:"f00000000000000000000002",
          delivery,
          del_pr,
          price


        };
        try {
          const response = await axios.post("/api/orders", data);
          if (response.status === 200) {

            window.fbq("track", "Purchase",  {
                value: price,
                currency: 'DZD',
                content_type: 'product'
              } )

            router.push("/thank-you");
          } else {
            alert("Une erreur est survenue lors de la creation de la commande");
          }
        } catch (error) {
          alert("Une erreur est survenue lors de la creation de la commande");
        }


      }




      const total =  price + del_pr ;



    return (
            <div>
                <div className="bg-white mb-20  pt-5 lg:hidden">
                            <div className=" flex fixed w-full top-0  bg-slate-200 h-15 p-3 z-30">
        <Link href={'/products'} ><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5">
<path stroke-linecap="round" stroke-linejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
</svg>
</Link>
      <div className=" flex grow  justify-center">
      <Logo />
      </div>
      <div className=" flex justify-end"></div>
      <button onClick={() => navigator.share(shareData)}><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
<path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
</svg>
</button>
        </div>


     <div className="grid grid-cols-4 mt-10 ">
     <div><h1 class="font-bold text-7xl wideboi -rotate-90  mt-[20.4rem] text-gray-400 col-span-1 row-span-4 title">WADFOW</h1></div>
     <div className="col-span-3">      <Image priority={true} src="https://media.example.com/cdn/shop/files/WYM1B13-WadfowPackagingOnly_1_copy.jpg?v=1717049755&width=675" className="slide-in   -z-10" alt="logo" height="600" width="600"></Image>

                        <div class="info"><h2 className="font-bold pl-1 text-3xl tracking-wide text-orange-600 mt-2">JEU DE 13 CLÉS À CHOCS</h2>

        </div></div>

</div>
<div className=" w-full bg-white  flex flex-col justify-between  mt-10">


        <Link href="#order" className="bg-orange-500  hover:bg-teal-700 mx-auto text-white px-6  py-3 border-solid  font-semibold rounded-full text-lg btnn animate-pulse duration-300">
        Acheter maintenant
      </Link>
      <h1 className="mt-3 text-center font-bold  text-3xl">3850DA</h1>

    </div>




                    <div className="px-4 py-4 mt-10 bg-gradient-to-r from-gray-200 to-gray-100 rounded-lg m-2">
                    <p>

Jeu de 13 tournevis à percussion<br></br>
Inclure:<br></br>
</p>
<ul>
    <li>1 tournevis à percussion
</li>

<li>1 adaptateur de manchon 1/2&quot;-5/16&quot;.</li>
<li>13 embouts de tournevis : SL5/SL6/SL8/SL9/PH1/PH2*2/PH3/PH4/H4/H5/H6/H8.</li>
<li>Matériau des embouts : Cr-V, traitement thermique</li>
<li>Emballé dans une boîte en plastique</li></ul></div>
                    <div className="mt-10 mx-3"><h1 className=" text-xl font-semibold  mb-4  " id="order">Information De La Commande</h1>
      <form onSubmit={saveOrder}>

      <label className="text-lg  ">Nom *<input   value={lastName}
          onChange={(e) => setLastName(e.target.value)} type="text" name="lastName" className="mt-2 mb-6 ring-1 ring-gray-300 focus:ring-black rounded-full w-full  text-lg px-2 py-2 outline-none transition-all duration-500" placeholder=""></input></label>
          <label className="text-lg  ">Prenom *<input name="firstName"  value={firstName}
          onChange={(e) => setFirstName(e.target.value)} type="text" className="mt-2 mb-6 ring-1 ring-gray-300 focus:ring-black rounded-full w-full  text-lg px-2 py-2 outline-none transition-all duration-500" placeholder=""></input></label>
      <label className="text-lg  "></label>Wilaya *<select value={selectedWilayaId}
          onChange={(e) => {
            const wilaya = deliveryCatalog?.wilayas.find((entry) => entry.wilayaId === Number(e.target.value));
            setSelectedWilayaId(wilaya?.wilayaId ?? 16);
            setState(wilaya?.name ?? "Alger");
          }}   className="mt-2 mb-6 ring-1 ring-gray-300 bg-transparent focus:ring-black rounded-full w-full  text-lg px-2 py-2 outline-none transition-all duration-500" >
  {(deliveryCatalog?.wilayas ?? []).map((wilaya) => (
    <option key={wilaya.wilayaId} value={wilaya.wilayaId}>{wilaya.name}</option>
  ))}
</select>
<label className="text-lg  ">Commune *<select value={city} name="city"
          onChange={(e) => setCity(e.target.value)} className="mt-2 mb-6 ring-1 ring-gray-300 focus:ring-black rounded-full w-full  text-lg px-2 py-2 outline-none transition-all duration-500" disabled={availableCommunes.length === 0}><option value="">-- Commune --</option>{availableCommunes.map((commune) => (
            <option key={commune.communeId} value={commune.name}>{commune.name}</option>
          ))}</select></label>
      <label className="text-lg  ">Adresse *<input value={homeAddress}
          onChange={(e) => setHomeAddress(e.target.value)} name="homeAddress" type="text" className="mt-2 mb-6 ring-1 ring-gray-300 focus:ring-black rounded-full w-full  text-lg px-2 py-2 outline-none transition-all duration-500" placeholder=""></input></label>
      <label className="text-lg  ">Numero Du Telephone * <input required value={phoneNumber1} name="phoneNumber"
          onChange={(e) => setPhoneNumber1(e.target.value)} type="tel" className="mt-2 mb-6 ring-1 ring-gray-300 focus:ring-black rounded-full w-full  text-lg px-2 py-2 outline-none transition-all duration-500" placeholder=""></input></label>
      <label className="text-lg  ">E-mail (optionnel)<input value={email}
          onChange={(e) => setEmail(e.target.value)} type="email" className="mt-2 mb-6 ring-1 ring-gray-300 focus:ring-black rounded-full w-full  text-lg px-2 py-2 outline-none transition-all duration-500" name="email" placeholder=""></input></label>
      <label className="text-lg  ">Numero Du Telephone 2 (optionnel)<input  value={phoneNumber2}
          onChange={(e) => setPhoneNumber2(e.target.value)} name="phoneNumber" type="tel" className="mt-2 mb-6 ring-1 ring-gray-300 focus:ring-black rounded-full w-full  text-lg px-2 py-2 outline-none transition-all duration-500" placeholder=""></input></label>
      <label className="text-lg ">Selectionner un mode de livraison:</label>
      <div className="flex mt-2  justify-between">
      <label htmlFor="rad1"> <div className= {"   mb-2 py-2 px-2 rounded-lg   text-center  " + (delivery === "home" ? " bg-teal-600 text-white " : "ring-1 ring-black")}><input type="radio" className="appearance-none" id="rad1" name="livraison" value='home' onChange={(e) => setDelivery(e.target.value)} /><span  className=" font-medium">Livraison a domicile</span></div></label>
        <label htmlFor="rad2"><div className={"   mb-2 py-2 px-3 rounded-lg   text-center   " + (delivery === "office" ? " bg-teal-600 text-white " : " ring-1 ring-black") + (!officeAvailable ? " opacity-50" : "")}><input type="radio" className="appearance-none" id="rad2" name="livraison" value="office" disabled={!officeAvailable} onChange={(e) => setDelivery(e.target.value)} /><span  className=" font-medium">Livraison au poste</span></div></label>
      </div>
          <div className="flex border-b border-emerald-700 justify-between mb-2 mt-6">
            <span className=" font-semibold text-lg ">Soustotal:</span>
            <span className=" font-bold text-lg text-emerald-700 ">{price}DA</span></div>
            {del_pr > 0 ? (<div><div className="flex border-b border-emerald-700 justify-between mb-2">
           <span className=" font-semibold text-lg">Livraison:</span>
                <span className=" font-bold text-lg text-emerald-700">{del_pr}DA</span>

            </div>
                      <div className="flex border-b border-emerald-700 justify-between mb-2">
                      <span className=" font-semibold text-lg">Total:</span>
                      <span className=" font-bold text-lg text-emerald-700">{total}DA</span>
                  </div></div>) : <span className=" font-semibold text-red-500">Livraison pas disponible avec cette option</span>}




            {del_pr > 0 ? (<div className="flex text-center text-white m-2 mt-6">
                <button type="submit" className="bg-teal-600 px-6 py-2 w-full rounded-lg text-xl font-semibold">Confirmer La Commande </button>
            </div> ) : null}
            </form></div>
            <div>
    <h1 className="text-center text-2xl font-semibold mt-5">Images</h1>
    <Image alt="image" className="m-2" height={500} width={500} src={"https://media.example.com/cdn/shop/files/WYM1B13-WadfowPackagingOnly_1_copy.jpg?v=1717049755&width=675"}></Image>
    <Image alt="image" className="m-2" height={500} width={500} src={"https://media.example.com/cdn/shop/files/WYM1B13_1ec11940-6fb9-438d-8539-c493db1b62e1.jpg?v=1717049755&width=910"}></Image>
    <Image alt="image" className="m-2" height={500} width={500} src={"https://media.example.com/cdn/shop/files/WYM1B13-Dimensionscopy.psd.jpg?v=1717049755&width=675"}></Image>
    <Image alt="image" className="m-2" height={500} width={500} src={"https://media.example.com/cdn/shop/files/WYM1B13-Diagramcopy.psd.jpg?v=1717049755&width=675"}></Image>
    <Image alt="image" className="m-2" height={500} width={500} src={"https://media.example.com/cdn/shop/files/WYM1B13-AnglesPhotoscopy.jpg?v=1717049755&width=675"}></Image>

</div>
                </div>
                <div className="hidden lg:flex">
        <Layout>
          <div className="grid grid-cols-2 gap-3 p-4 w-full ">

<div className="  ">
<div id='img cont' className="border-b-2 border-solid border-gray-400 p-4 rounded-lg bg-white shadow pb-6">
          <Carousel data={["https://media.example.com/cdn/shop/files/WYM1B13-WadfowPackagingOnly_1_copy.jpg?v=1717049755&width=675",
            "https://media.example.com/cdn/shop/files/WYM1B13_1ec11940-6fb9-438d-8539-c493db1b62e1.jpg?v=1717049755&width=910",
            "https://media.example.com/cdn/shop/files/WYM1B13-Dimensionscopy.psd.jpg?v=1717049755&width=675",
            "https://media.example.com/cdn/shop/files/WYM1B13-Diagramcopy.psd.jpg?v=1717049755&width=675",
            "https://media.example.com/cdn/shop/files/WYM1B13-AnglesPhotoscopy.jpg?v=1717049755&width=675",
            ]} />
          </div>
          <div id='price' className="mt-6"><span className="font-semibold text-3xl">Prix: </span><span className="font-bold text-3xl text-emerald-700">3580DA</span></div>
          <p className={` font-medium mb-1 lg:text-base text-teal-500`}>
En stock
            </p>
          <div className="flex flex-row mt-6 gap-6 justify-center">
            <Link href="/products/66e35890667b3de6c9015ce5/checkout"  className=" px-24 py-4 text-xl bg-black text-white rounded-lg hover:bg-teal-700 transition-all duration-300">Acheter maintenant
            </Link>
            <button onClick={() => addProduct('f00000000000000000000003')} className="px-28 py-4 text-xl bg-white text-black ring-1 hover:bg-teal-700 transition-all duration-300 ring-black rounded-lg">Ajouter au panier
            </button>
          </div>
</div>
<div>
<div id='brand' className="m-2 ">


  <Image src="https://media.example.com/cdn/shop/collections/rsz_logo-wadfow.png?v=1691303000" alt="brand" width={220} height={160}  />


          </div>
          <div id='text' className="ml-3">
              <div id='title'>
                  <h3 className="text-2xl font-medium mt-16">WADFOW Jeu de 13 clés à chocs</h3>
              </div>

              <div id='desc' className="mt-12 text-base   "><pre className="text-wrap">
Spécification
Modèle : WYM1B13
Jeu de 13 tournevis à percussion
Inclure:
1 tournevis à percussion
1 adaptateur de manchon 1/2&quot;-5/16&quot;.
13 embouts de tournevis : SL5/SL6/SL8/SL9/PH1/PH2*2/PH3/PH4/H4/H5/H6/H8.
Matériau des embouts : Cr-V, traitement thermique
Emballé dans une boîte en plastique</pre></div>

          </div>

</div>


            </div></Layout></div>
            </div>

    );
}
