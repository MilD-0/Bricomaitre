"use client";
import axios from "axios";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";

import React, { useRef } from "react";

import { utils, writeFileXLSX } from "xlsx";

import Layout from "../components/layout";

export default function Orders() {
  const tbl = useRef(null);
  const [orders, setOrders] = useState([]);
  const [data, setData] = useState([]);
  const tbl2 = useRef(null);
  const handleFileUpload = (e) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(e.target.files[0]);
    reader.onload = (e) => {
      const data = e.target.result;
      const workbook = XLSX.read(data, { type: "binary" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const parsedData = XLSX.utils.sheet_to_json(sheet);
      setData(parsedData);

      parsedData.forEach((product) => {
        // Process each product object
        console.log(product);
        // You can perform further operations like saving to the database here
      });
    };
  };
  async function SaveProduct() {
    let count = 0;
    for (const item of data) {
      const vata = {
        title: item.title,
        description: item.description,
        title_en: item.title_en,
        description_en: item.description_en,
        title_ar: item.title_ar,
        description_ar: item.description_ar,
        summary: item.summary,
        summary_ar: item.summary_ar,
        summary2: item.summary2,
        summary2_ar: item.summary2_ar,
        vidlink: item.vidlink,
        color: item.color,
        price: item.price,
        images: item.images ? item.images.split(", ") : [], // Split the concatenated string back into an array
        brand: item.brand,
        stock: item.stock,
        category: item.category,
        features: item.features ? item.features.split(", ") : [], // Split the concatenated string back into an array
        features_ar: item.features_ar ? item.features_ar.split(", ") : [], // Split the concatenated string back into an array
        featured: item.featured,
        specDescs: item.specDescs ? item.specDescs.split(", ") : [], // Split the concatenated string back into an array
        specDescs_ar: item.specDescs_ar ? item.specDescs_ar.split(", ") : [], // Split the concatenated string back into an array
        specIcons: item.specIcons ? item.specIcons.split(", ") : [], // Split the concatenated string back into an array
        specValues: item.specValues ? item.specValues.split(", ") : [], // Split the concatenated string back into an array
        by: "auto",
        __v: item.__v,
      };

      await axios.post("/api/products", vata);
      count++;
      console.log(`saved produit ${item.title} , ${count}/${data.length}`);
    }
  }

  useEffect(() => {
    axios.get("/api/export").then((response) => {
      setOrders(response.data);
    });
  }, []);
  const [products, setProducts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    axios.get("/api/products").then((response) => {
      setProducts(response.data);
    });
    axios.get("/api/brands").then((response) => {
      setBrands(response.data);
    });
    axios.get("/api/categories").then((response) => {
      setCategories(response.data);
    });
  }, []);
  function calculateSubtotal(order) {
    const subtotal = order.cartProducts.reduce((total, productId) => {
      const product = products.find((p) => p._id === productId);
      return total + (product ? product.price : 0);
    }, 0);
    return subtotal;
  }
  const textToNumberMap = {
    Adrar: 1,
    Chlef: 2,
    Laghouat: 3,
    "Oum El Bouaghi": 4,
    Batna: 5,
    Béjaïa: 6,
    Biskra: 7,
    Béchar: 8,
    Blida: 9,
    Bouïra: 10,
    Tamanrasset: 11,
    Tébessa: 12,
    Tlemcen: 13,
    Tiaret: 14,
    "Tizi Ouzou": 15,
    Alger: 16,
    Djelfa: 17,
    Jijel: 18,
    Sétif: 19,
    Saïda: 20,
    Skikda: 21,
    "Sidi Bel abbès": 22,
    Annaba: 23,
    Guelma: 24,
    Constantine: 25,
    Médéa: 26,
    Mostaganem: 27,
    Msila: 28,
    Mascara: 29,

    Ouargla: 30,
    Oran: 31,
    "El Bayadh": 32,
    Illizi: 33,
    "Bordj Bou Arreridj": 34,
    Boumerdès: 35,
    "El Tarf": 36,
    Tindouf: 37,
    Tissemsilt: 38,
    "El Oued": 39,
    Khenchla: 40,
    "Souk Ahras": 41,
    Tipaza: 42,
    Mila: 43,
    "Aïn Defla": 44,
    Naâma: 45,
    "Aïn Témouchent": 46,
    Ghardaïa: 47,
    Relizane: 48,
    Timimoun: 49,
    "Bordj Badji Mokhtar": 50,
    "Ouled Djellal": 51,
    "Béni Abbès": 52,
    "In Salah": 53,
    "In Guezzam": 54,
    Touggourt: 55,
    Djanet: 56,
    "El Mghair": 57,
    "El Meniaa": 58,
  };

  const transformTextToNumber = (text) => {
    return textToNumberMap[text] || text; // Return the mapped number or the original text if not found
  };

  return (
    <Layout>
      <table ref={tbl} className="basic">
        <thead>
          <tr>
            <td>Nom Complet</td>
            <td>Téléphone 1</td>
            <td>Téléphone 2</td>
            <td>Produit</td>
            <td>Quantité</td>
            <td>Adresse</td>
            <td>Wilaya</td>
            <td>Commune</td>
            <td>Total à ramasser</td>
            <td>Note</td>
            <td>ID</td>
            <td>Echange ( OUI )</td>
            <td>Stopdesk ( OUI )</td>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order._id}>
              <td>
                {order.firstName} {order.lastName}
              </td>
              <td>0{order.phoneNumber1}</td>
              <td>0{order?.phoneNumber2}</td>
              <td>
                {order.cartProducts.map((productId) => {
                  const product = products.find((p) => p._id === productId);
                  return product ? (
                    <div key={product._id}>
                      {product.title}:{product.price}DA<br></br>
                      {product._id === "f00000000000000000000001" &&
                        order.variant.length > 1 && (
                          <p>Style:{order.variant}</p>
                        )}
                    </div>
                  ) : null;
                })}
              </td>
              <td>1</td>
              <td>{order.homeAddress}</td>
              <td>{transformTextToNumber(order.state)}</td>
              <td>{order.city}</td>
              <td>{calculateSubtotal(order) + order.del_pr}</td>
              <td></td>
              <td>{Math.floor(Math.random() * 9999)}</td>
              <td>NON</td>
              <td>
                {order.delivery === "home" ? (
                  <p>NON</p>
                ) : order.delivery === "office" ? (
                  <p>OUI</p>
                ) : (
                  <p>Unknown delivery type</p>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button
        className="btn-primary text-center w-full py-2 text-lg font-semibold mt-3"
        onClick={() => {
          // generate workbook from table element
          const wb = utils.table_to_book(tbl.current);
          // write to XLSX
          writeFileXLSX(wb, "SheetJSReactExport.xlsx");
          orders.map((order) => {
            axios.put("/api/orders?id=" + order._id, {
              ...order,
              confirmed: "dispatched",
            });
          });
        }}
      >
        Exporter vers excel
      </button>

      <div className="mt-8">
        <table className=" hidden" ref={tbl2}>
          <thead>
            <tr>
              <td>id</td>
              <td>title</td>
              <td>description</td>
              <td>availability</td>
              <td>condition</td>
              <td>price</td>
              <td>link</td>
              <td>image_link</td>
              <td>brand</td>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product._id}>
                <td>{product._id}</td>

                <td>{product.title}</td>
                <td className="text-ellipsis">{product.description}</td>
                <td>{product.stock > 0 ? "in stock" : "out of stock"} </td>
                <td>new</td>
                <td>{product.price} DZD</td>
                <td>https://bricomaitre.com/products/{product._id}</td>
                <td>{product.images[0]}</td>

                <td>
                  {brands.find((brand) => brand._id === product.brand)?.name ??
                    "Sans marque"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          className="btn-primary text-center w-full py-2 text-lg font-semibold mt-3"
          onClick={() => {
            // generate workbook from table element
            const wb = utils.table_to_book(tbl2.current);
            // write to XLSX
            writeFileXLSX(wb, "Products.xlsx");
          }}
        >
          Exporter Produits vers excel
        </button>
        <h1>Importer avec excel</h1>
        <input
          type="file"
          accept=".xlsx, .xls"
          onChange={handleFileUpload}
        ></input>
        {data && data.length > 0 && (
          <button
            className="btn-primary text-center w-full py-2 text-lg font-semibold mt-3"
            onClick={SaveProduct}
          >
            Save
          </button>
        )}
      </div>
    </Layout>
  );
}
