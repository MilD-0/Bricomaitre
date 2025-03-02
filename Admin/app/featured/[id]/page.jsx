"use client"
import { useEffect, useState } from 'react'
import Layout from '/app/components/layout'
import axios from 'axios';
import FeaturedForm from '../../components/featuredForm';
export default function EditFeaturedPage ({params}) {
    const[featuredInfo,setFeaturedInfo] = useState(null);
    const id= params.id;

    useEffect(()=>{
        if(!id){
            return;
        }
        axios.get('/api/featured?id='+id).then(response => {
            setFeaturedInfo(response.data);
        });
    }, [id]);
    return (
        <Layout>
                       <h1 className="titel">
               Modifier la vedette
            </h1>
            {featuredInfo && (<FeaturedForm {...featuredInfo} />)}
            </Layout>

    )
}