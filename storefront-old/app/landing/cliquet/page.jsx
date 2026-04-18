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




export default function Clic () {

    const [product, setProduct] = useState(null);
    const {addProduct} = useContext(CartContext);
    const [brand,setBrand] = useState(null);


    const shareData = {
      title: "Produit Bricomaitre",
      url: "https://bricomaitre.com/landing/cric",
    };
    const price = 15800
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
          cartProducts:"f00000000000000000000003",
          delivery,
          del_pr,
          price


        };
        try {
          const response = await axios.post("/api/orders", data);
          if (response.status === 200) {
            alert("Commande effectuee avec succes");

            router.push("/");
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


     <div className="grid grid-cols-4 mt-5">
     <div><h1 class="font-bold text-7xl wideboi -rotate-90  mt-[20.4rem] text-cyan-700 col-span-1 row-span-4 title">TOTAL</h1></div>
     <div className="col-span-3">      <Image priority={true} src="https://media.example.com/attachments/654335080163966979/1296441060767170631/Asset_13total.webp?ex=67124c53&is=6710fad3&hm=425c985f1f14ea8961163c5e62ffbbd399f34020a74be65e93422accaa61944c&" className="slide-in   -z-10" alt="logo" height="600" width="600"></Image>

                        <div class="info"><h2 className="font-bold text-2xl tracking-wide text-cyan-700 ">CLÉ À CLIQUET SANS FIL<br></br></h2>
                        <h2 className="font-semibold text-xl tracking-wide text-cyan-800 ">Chargeur + Batterie inclus!</h2>
                        <p className="font-bold text-sm mr-1  top-[17.2rem] right-12 text-gray-500 text-pretty z-10">La clé à cliquet sans fil est un outil polyvalent et pratique pour tous vos travaux de bricolage. Grâce à sa fonction sans fil, vous pouvez l&apos;utiliser n&apos;importe où sans vous soucier des fils ou des prises électriques.</p>
        </div></div>

</div>
<div className=" w-full bg-white  flex flex-col justify-between  mt-10">


        <Link href="#order" className="bg-orange-500  hover:bg-teal-700 mx-auto text-white px-6  py-3 border-solid  font-semibold rounded-full text-lg btnn animate-pulse duration-300">
        Acheter maintenant
      </Link>
      <h1 className="mt-3 text-center font-bold  text-3xl">15800DA</h1>

    </div>
                    <div  className="flex   justify-center mt-10 "><div className="flex flex-row gap-4"><div class="m-auto  box-md rounded-2xl p-5 shadow-xl bg-gray-100 py-10 text-black "><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-9 justify-center mx-auto text-teal-600">
  <path fill-rule="evenodd" d="M12 6.75a5.25 5.25 0 0 1 6.775-5.025.75.75 0 0 1 .313 1.248l-3.32 3.319c.063.475.276.934.641 1.299.365.365.824.578 1.3.64l3.318-3.319a.75.75 0 0 1 1.248.313 5.25 5.25 0 0 1-5.472 6.756c-1.018-.086-1.87.1-2.309.634L7.344 21.3A3.298 3.298 0 1 1 2.7 16.657l8.684-7.151c.533-.44.72-1.291.634-2.309A5.342 5.342 0 0 1 12 6.75ZM4.117 19.125a.75.75 0 0 1 .75-.75h.008a.75.75 0 0 1 .75.75v.008a.75.75 0 0 1-.75.75h-.008a.75.75 0 0 1-.75-.75v-.008Z" clip-rule="evenodd" />
</svg>

<h2 className="text-center text-2xl text-teal-600 my-3">&gt; 65Nm</h2>
<p className="pt-1 text-center">Couple maximal</p>
</div>



<div className="flex flex-col gap-3">



    <div class="box-sm ring-black rounded-xl p-2 shadow-xl bg-gray-100 py-4 text-black "><svg xmlns="http://www.w3.org/2000/svg"  viewBox="0 0 24 24" fill="currentColor" class="size-6 justify-center mx-auto text-teal-600">
  <path fill-rule="evenodd" d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.302H3.75a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .913-.143Z" clip-rule="evenodd" />
</svg>


<h2 className="text-center  text-teal-600">20V</h2>
<p className="pt-1 text-sm text-center">Tension</p>
</div>





<div class=" ring-black box-sm rounded-xl p-2 shadow-xl bg-gray-100 py-4 text-black "><svg xmlns="http://www.w3.org/2000/svg" class="size-6 justify-center mx-auto text-teal-600" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" >
  <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75 12 3m0 0 3.75 3.75M12 3v18" />
</svg>

<h2 className="text-center  text-teal-600"> 250tr/min</h2>
<p className="pt-1 text-sm text-center">Vitesse</p>






</div>

</div>

</div></div>



                    <div className="px-4 py-4 mt-10 bg-gradient-to-r from-gray-200 to-gray-100 rounded-lg m-2">
                    <p>- La clé à cliquet sans fil est un outil polyvalent et pratique pour tous vos travaux de bricolage. Grâce à sa fonction sans fil, vous pouvez l&apos;utiliser n&apos;importe où sans vous soucier des fils ou des prises électriques.<br></br><br></br> - Que ce soit pour serrer ou desserrer des vis, des écrous ou des boulons, la clé à cliquet vous offre un gain de temps considérable. Avec différentes tailles de douilles et une clé dynamométrique intégrée, vous pouvez facilement ajuster la force de serrage selon vos besoins. <br></br> <br></br>

- Elle est idéale pour travailler dans les endroits étroits ou encombrés comme les moteurs. Elle offre une tête rotative, un large interrupteur et un embout d&apos;extension permettant d&apos;accéder aux endroits confinés. En fournissant jusqu&apos;à 65 Nm de couple, elle est parfaite pour les travaux dans l&apos;automobile ou la moto.<br></br><br></br></p>
<ul>
    <li>Tension : 20V
</li>
<li>Couple maximal : 65Nm</li>
<li>Embranchement carré : 3/8&quot;</li>
<li>Vitesse à vide : 250tr/min</li>
<li>Square Drive: 3/8&quot;</li></ul></div>
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
            {del_pr > 70 ? (<div><div className="flex border-b border-emerald-700 justify-between mb-2">
           <span className=" font-semibold text-lg">Livraison:</span>
                <span className=" font-bold text-lg text-emerald-700">{del_pr}DA</span>

            </div>
                      <div className="flex border-b border-emerald-700 justify-between mb-2">
                      <span className=" font-semibold text-lg">Total:</span>
                      <span className=" font-bold text-lg text-emerald-700">{total}DA</span>
                  </div></div>) : <span className=" font-semibold text-red-500">Livraison pas disponible avec cette option</span>}




            {del_pr > 70 ? (<div className="flex text-center text-white m-2 mt-6">
                <button type="submit" className="bg-teal-600 px-6 py-2 w-full rounded-lg text-xl font-semibold">Confirmer La Commande </button>
            </div> ) : null}
            </form></div>
            <div>
    <h1 className="text-center text-2xl font-semibold mt-5">Images</h1>
    <Image alt="image" className="m-2" height={500} width={500} src={"https://media.example.com/attachments/654335080163966979/1296441060767170631/Asset_13total.webp?ex=67124c53&is=6710fad3&hm=425c985f1f14ea8961163c5e62ffbbd399f34020a74be65e93422accaa61944c&"}></Image>
    <Image alt="image" className="m-2" height={500} width={500} src={"https://media.example.com/attachments/654335080163966979/1296441059857006715/TDRLI2060151_E5A49AE8A792E5BAA6E59BBE_E5A4A7_28329.webp?ex=67124c53&is=6710fad3&hm=03442197fd1e620375641438f2a47adabc465edbba3ff35daba15781675017ac&"}></Image>
    <Image alt="image" className="m-2" height={500} width={500} src={"https://media.example.com/attachments/654335080163966979/1296441060230172672/TDRLI2060151_E5A49AE8A792E5BAA6E59BBE_E5A4A7_28429.webp?ex=67124c53&is=6710fad3&hm=292b4e9f3bfb9f4936082ef47184bb5a5fbbe0b6da8f5a78933214ceb91ba660&"}></Image>


</div>
                </div>
                <div className="hidden lg:flex">
        <Layout>
          <div className="grid grid-cols-2 gap-3 p-4 w-full ">

<div className="  ">
<div id='img cont' className="border-b-2 border-solid border-gray-400 p-4 rounded-lg bg-white shadow ">
          <Carousel data={["https://media.example.com/attachments/654335080163966979/1296441060767170631/Asset_13total.webp?ex=67124c53&is=6710fad3&hm=425c985f1f14ea8961163c5e62ffbbd399f34020a74be65e93422accaa61944c&",
            "https://media.example.com/attachments/654335080163966979/1296441060230172672/TDRLI2060151_E5A49AE8A792E5BAA6E59BBE_E5A4A7_28429.webp?ex=67124c53&is=6710fad3&hm=292b4e9f3bfb9f4936082ef47184bb5a5fbbe0b6da8f5a78933214ceb91ba660&",
            "https://media.example.com/attachments/654335080163966979/1296441059857006715/TDRLI2060151_E5A49AE8A792E5BAA6E59BBE_E5A4A7_28329.webp?ex=67124c53&is=6710fad3&hm=03442197fd1e620375641438f2a47adabc465edbba3ff35daba15781675017ac&",]} />
          </div>
          <div id='price' className="mt-6"><span className="font-semibold text-3xl">Prix: </span><span className="font-bold text-3xl text-emerald-700">15800DA</span></div>
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

          {brand && (
  <Image src="https://media.example.com/images/feature_variant/5/441-4412319_total-tools-logo-graphic-design.png" alt={brand.name} width={220} height={160}  />
)}

          </div>
          <div id='text' className="ml-3">
              <div id='title'>
                  <h3 className="text-2xl font-medium mt-16">TOTAL Clé à cliquet sans fil</h3>
              </div>

              <div id='desc' className="mt-12 text-base   "><pre className="text-wrap">La clé à cliquet sans fil est un outil polyvalent et pratique pour tous vos travaux de bricolage. Grâce à sa fonction sans fil, vous pouvez l&apos;utiliser n&apos;importe où sans vous soucier des fils ou des prises électriques. Que ce soit pour serrer ou desserrer des vis, des écrous ou des boulons, la clé à cliquet vous offre un gain de temps considérable. Avec différentes tailles de douilles et une clé dynamométrique intégrée, vous pouvez facilement ajuster la force de serrage selon vos besoins.</pre></div>

          </div>

</div>


            </div></Layout></div>
            </div>

    );
}
