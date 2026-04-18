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




export default function Cric () {

    const [product, setProduct] = useState(null);
    const {addProduct} = useContext(CartContext);
    const [brand,setBrand] = useState(null);


    const shareData = {
      title: "Produit Bricomaitre",
      url: "https://bricomaitre.com/landing/cric",
    };
    const price = 5500
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
          cartProducts:"f00000000000000000000004",
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
                            <div className=" flex fixed w-screen top-0  bg-slate-200 h-15 p-3 z-30">
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


     <div className="grid grid-cols-4 mt-5">
     <div><h1 class="font-bold text-7xl wideboi -rotate-90  mt-[18.7rem] text-gray-400 col-span-1 row-span-4 title">BEETRO</h1></div>
     <div className="col-span-3">      <Image src="https://media.example.com/attachments/654335080163966979/1274681745744203850/cric-hydraulique-a-chariot-2t-135-300mm-beetro_2.jpg?ex=67123d62&is=6710ebe2&hm=cc4b685c794e65a3d659a2d8d227c1b5af7a642a3fa1dc1961805f4c3a0c4353&13d8022e2fad8851d5fc55dac280a479aa0b620606572b4d8c01f8b6e350b8e9&" className="slide-in   -z-10" alt="logo" height="600" width="600"></Image>

                        <div class="info"><h2 className="font-bold text-2xl tracking-wide   text-orange-600 ">CRIC HYDRAULIQUE<br></br> 2 TON</h2>
                        <p className="font-bold text-sm mr-1  top-[17.2rem] right-12 text-gray-500 text-pretty z-10">Le cric hydraulique à chariot BEETRO de 2 tonnes est un outil robuste et polyvalent conçu pour faciliter le levage sûr et efficace de véhicules automobiles. Vraiment un choix idéal pour une variété de véhicules, y compris les voitures de taille moyenne et les SUV.</p>
        </div></div>

</div>
<div className=" w-full bg-white  flex flex-col justify-between  mt-10">


        <Link href="#order" className="bg-orange-500  hover:bg-teal-700 mx-auto text-white px-6  py-3 border-solid  font-semibold rounded-full text-lg btnn animate-pulse duration-300">
        Acheter maintenant
      </Link>
      <h1 className="mt-3 text-center font-bold  text-3xl">5500DA</h1>

    </div>
                    <div  className="flex   justify-center mt-10 "><div className="flex flex-row gap-4"><div class="m-auto  box-md rounded-2xl p-5 shadow-xl bg-gray-100 py-10 text-black "><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-10 justify-center mx-auto text-teal-600">
  <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
</svg>
<h2 className="text-center text-2xl text-teal-600 my-3">&gt; 15 Sec.</h2>
<p className="pt-1 text-center">Temps de soulever</p>
</div>



<div className="flex flex-col gap-3">



    <div class="box-sm ring-black rounded-xl p-2 shadow-xl bg-gray-100 py-4 text-black "><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6 justify-center mx-auto text-teal-600">
  <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0 0 12 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 0 1-2.031.352 5.988 5.988 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971Zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 0 1-2.031.352 5.989 5.989 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971Z" />
</svg>

<h2 className="text-center  text-teal-600">2 Ton.</h2>
<p className="pt-1 text-sm text-center">Capacité</p>
</div>





<div class=" ring-black box-sm rounded-xl p-2 shadow-xl bg-gray-100 py-4 text-black "><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6 justify-center mx-auto text-teal-600">
  <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75 12 3m0 0 3.75 3.75M12 3v18" />
</svg>

<h2 className="text-center  text-teal-600"> 135-300 mm.</h2>
<p className="pt-1 text-sm text-center">Déplacement</p>






</div>

</div>

</div></div>



                    <div className="px-4 py-4 mt-10 bg-gradient-to-r from-gray-200 to-gray-100 rounded-lg m-2">
                        <h1 className=" text-center font-medium">Pourquoi ne pas utiliser ce qui vient avec la voiture?</h1>
                        <div className="flex flex-col mt-5">
                            <h1 className="text-lg font-semibold">Cric Manuel:</h1>
                            <ul>
                               <li> • +1 min temps de soulever.</li>
                               <li> • Meme pas 600 Kg capacité.</li>
                               <li> • Difficile à utiliser.</li>
                               <li> • Dangereux.</li>
                            </ul>
                        </div>
                        <div className="flex flex-col mt-5">
                            <h1 className="text-lg font-semibold">Cric Hydraulique:</h1>
                            <ul>
                               <li> • Meme pas 15 seconds temps de soulever.</li>
                               <li> • 2 Ton capacité.</li>
                               <li> • Facile à utiliser.</li>
                               <li> • Sûre et dur.</li>
                            </ul>

                    </div></div>
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
                </div>
                <div className="hidden lg:flex">
        <Layout>
          <div className="grid grid-cols-2 gap-3 p-4 w-full ">

<div className="  ">
<div id='img cont' className="border-b-2 border-solid border-gray-400 p-4 rounded-lg bg-white shadow ">
          <Carousel data={["https://media.example.com/attachments/654335080163966979/1274681745744203850/cric-hydraulique-a-chariot-2t-135-300mm-beetro_2.jpg?ex=67123d62&is=6710ebe2&hm=cc4b685c794e65a3d659a2d8d227c1b5af7a642a3fa1dc1961805f4c3a0c4353&13d8022e2fad8851d5fc55dac280a479aa0b620606572b4d8c01f8b6e350b8e9&","https://media.example.com/images/thumbnails/590/590/detailed/149/hydraulic1.png","https://media.example.com/images/thumbnails/590/590/detailed/149/hydru2.png","https://media.example.com/images/thumbnails/590/590/detailed/149/hydru3.png"]} />
          </div>
          <div id='price' className="mt-6"><span className="font-semibold text-3xl">Prix: </span><span className="font-bold text-3xl text-emerald-700">5500DA</span></div>
          <p className={` font-medium mb-1 lg:text-base text-teal-500`}>
En stock
            </p>
          <div className="flex flex-row mt-6 gap-6 justify-center">
            <Link href="/products/66c241e74dce7eb9f52f8b5e/checkout"  className=" px-24 py-4 text-xl bg-black text-white rounded-lg hover:bg-teal-700 transition-all duration-300">Acheter maintenant
            </Link>
            <button onClick={() => addProduct('f00000000000000000000004')} className="px-28 py-4 text-xl bg-white text-black ring-1 hover:bg-teal-700 transition-all duration-300 ring-black rounded-lg">Ajouter au panier
            </button>
          </div>
</div>
<div>
<div id='brand' className="m-2 ">

          {brand && (
  <Image src="https://media.example.com/images/S/stores-image-uploads-na-prod/8/AmazonStores/ATVPDKIKX0DER/28fdd8eca2d47989abc5bc5d54a52fd5.w6000.h1200.jpg" alt={brand.name} width={220} height={160}  />
)}

          </div>
          <div id='text' className="ml-3">
              <div id='title'>
                  <h3 className="text-2xl font-medium mt-16">BEETRO Cric hydraulique à chariot 2T 135-300mm</h3>
              </div>

              <div id='desc' className="mt-12 text-base   "><pre className="text-wrap">Le cric hydraulique à chariot BEETRO de 2 tonnes avec une plage de hauteur réglable de 135 à 300mm est un outil robuste et polyvalent conçu pour faciliter le levage sûr et efficace de véhicules automobiles. Doté d&apos;un mécanisme hydraulique puissant, ce cric offre une capacité de levage de 2 tonnes, ce qui en fait un choix idéal pour une variété de véhicules, y compris les voitures de taille moyenne et les SUV.</pre></div>

          </div>

</div>


            </div></Layout></div>
            </div>

    );
}
