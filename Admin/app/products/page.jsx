"use client";
import Link from "next/link";
import Layout from "../components/layout";
import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import debounce from "lodash/debounce";

export default function Products() {
  const [products, setProducts] = useState([]);
  const [titleSearch, setTitleSearch] = useState("");
  const [descriptionSearch, setDescriptionSearch] = useState("");
  useEffect(() => {
    axios.get("/api/products").then((response) => {
      setProducts(response.data);
    });
  }, []);
  function deleteProduct(product) {
    Swal.fire({
      title: "Confirmation",
      text: `Supprimer ${product.title}?`,
      showCancelButton: true,
      cancelButtonText: "Non",
      confirmButtonText: "Oui",
      confirmButtonColor: "#d55",
      background: "#e5e7eb",
      reverseButtons: true,
      icon: "question",
    }).then(async (result) => {
      if (result.isConfirmed) {
        const { _id } = product;
        await axios.delete("/api/products?id=" + _id);

        axios.get("/api/products").then((response) => {
          setProducts(response.data);
        });
      }
    });
  }
  const debouncedSetTitleSearch = useCallback(
    debounce((value) => {
      setTitleSearch(value);
    }, 300),
    []
  );

  const debouncedSetDescriptionSearch = useCallback(
    debounce((value) => {
      setDescriptionSearch(value);
    }, 300),
    []
  );

  const handleTitleSearchChange = (e) => {
    debouncedSetTitleSearch(e.target.value);
  };

  const handleDescriptionSearchChange = (e) => {
    debouncedSetDescriptionSearch(e.target.value);
  };

  const filteredProducts = products.filter(
    (product) =>
      product.title.toLowerCase().includes(titleSearch.toLowerCase()) &&
      product.description
        .toLowerCase()
        .includes(descriptionSearch.toLowerCase())
  );
  return (
    <Layout>
      <h1 className="titel">Page de les produits</h1>
      <Link className=" bouton " href={"/products/new"}>
        Ajouter un nouveau produit
      </Link>
      <input
        type="search"
        placeholder="Rechercher un produit par titre"
        className="search"
        onChange={handleTitleSearchChange}
      />
      <input
        type="search"
        placeholder="Rechercher un produit par description"
        className="search"
        onChange={handleDescriptionSearchChange}
      />
      <table className="basic">
        <thead>
          <tr>
            <td>Produits</td>

            <td>Modifier</td>
            <td>Supprimer</td>
            <td>Auto?</td>
          </tr>
        </thead>
        <tbody>
          {filteredProducts.map((product) => (
            <tr key={product._id}>
              <td>{product.title}</td>

              <td>
                <Link href={"/products/" + product._id} className="btnn ">
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
                      d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                    />
                  </svg>
                </Link>
              </td>
              <td>
                <button onClick={() => deleteProduct(product)} className=" del">
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
              <td>
                {product.by === "auto" ? (
                  <p>OUI(auto)</p>
                ) : (
                  <p>NON(manuelle)</p>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Layout>
  );
}
