"use client"
import { useEffect, useState } from 'react'
import Layout from '/app/components/layout'
import ProductForm from '/app/components/productForm'
import axios from 'axios';
export default function EditProductPage ({params}) {
    const[productInfo,setProductInfo] = useState(null);
    const id= params.id;

    useEffect(()=>{
        if(!id){
            return;
        }
        axios.get('/api/products?id='+id).then(response => {
            setProductInfo(response.data);
        });
    }, [id]);
    return (
        <Layout>
                       <h1 className="titel">
               Modifier le produit
            </h1>
            {productInfo && (<ProductForm {...productInfo} />)}
            </Layout>

    )
}