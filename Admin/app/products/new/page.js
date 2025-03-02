"use client"

import Layout from  "@/app/components/layout"
import ProductForm from  "@/app/components/productForm"

export default  function NewProduct(){
return (
    <Layout>
                   <h1 className="titel">
               Ajouter un Nouveau Produit
            </h1>
        <ProductForm /></Layout>
)
}