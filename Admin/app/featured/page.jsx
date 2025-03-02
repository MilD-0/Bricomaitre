"use client"
import Link from "next/link"
import Layout from "../components/layout"
import { useEffect, useState } from "react";
import axios from "axios";
import Swal from 'sweetalert2'

export default function Featureds(){

    const [featureds, setFeatureds]= useState([]);
    useEffect(()=>{
        axios.get('/api/featured').then(response =>{
            setFeatureds(response.data);
        });
    }, []);
    function deleteFeatured(featured){
        Swal.fire({
          title: 'Confirmation',
          text: `Supprimer ${featured.title1}?`,
          showCancelButton: true,
          cancelButtonText: 'Non',
          confirmButtonText: 'Oui',
          confirmButtonColor: '#d55',
          background: '#e5e7eb' ,
          reverseButtons: true,
          icon:"question"
        }).then(async result => {
          if (result.isConfirmed) {
            const {_id} = featured;
            await axios.delete('/api/featured?id='+_id);

            axios.get('/api/featured').then(response =>{
                setFeatureds(response.data);
            });
          }
        });
      }
    return (
        <Layout>
            <h1 className="titel">Page de les Vedettes</h1>
            <Link className=" bouton " href={'/featured/new'}>Ajouter une nouvelle vedette</Link>

        <table className="basic">
            <thead>
                <tr>
                    <td>Vedettes</td>
                    <td>Modifier</td>
                    <td>Supprimer</td>
                    </tr>
            </thead>
            <tbody>
            {featureds.map((featured)=>(
            <tr key={featured._id}>

                <td>{featured.title1}</td>
                <td><Link href={'/featured/'+featured._id} className="btnn ">
                     <svg className=" w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5">
  <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
</svg>
</Link>

</td>
<td><button onClick={() => deleteFeatured(featured)} className=" del">
<svg className=" w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5">
  <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
</svg>
</button></td>
            </tr>
            ))}
            </tbody>

        </table>
        </Layout>

    )

}
