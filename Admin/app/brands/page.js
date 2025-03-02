"use client"
import Layout from "../components/layout";
import {useEffect, useState} from "react";
import axios from "axios";
import Swal from 'sweetalert2'
import Image from "next/image";

export default function Brands() {
  const [editedBrand, setEditedBrand] = useState(null);

  const [brands,setBrands] = useState([]);
  const [featured,setFeatured] = useState(false);
  const [name,setName] = useState('');
  const [image, setImage] =useState('');
  useEffect(() => {
    fetchBrands();
  }, [])
  function fetchBrands() {
    axios.get('/api/brands').then(result => {
      setBrands(result.data);
    });
  }
  async function saveBrand(ev){
    ev.preventDefault();
    const data = {
      name,
      image,
      featured,
    };
    if (editedBrand) {
      data._id = editedBrand._id;
      await axios.put('/api/brands', data);
      setEditedBrand(null);
    } else {
      await axios.post('/api/brands', data);
    }
    setName('');
    setImage('');
    setFeatured(false);
    fetchBrands();
  }
  function editBrand(brand){
    setEditedBrand(brand);
    setName(brand.name);
    setFeatured(brand.featured);
    setImage(brand.image);
  }
  function deleteBrand(brand){
    Swal.fire({
      title: 'Confiramtion',
      text: `Supprimer ${brand.name}?`,
      showCancelButton: true,
      cancelButtonText: 'Non',
      confirmButtonText: 'Oui',
      confirmButtonColor: '#d55',
      background: '#e5e7eb' ,
      reverseButtons: true,
      icon:"question",
    }).then(async result => {
      if (result.isConfirmed) {
        const {_id} = brand;
        await axios.delete('/api/brands?id='+_id);
        fetchBrands();
      }
    });
  }

  return (
    <Layout>
      <h1 className="titel mb-8">Marques</h1>
      <label className="text-lg">
        {editedBrand
          ? `Modifier catégorie ${editedBrand.name}`
          : 'Creé une nouvelle catégorie'}
      </label>
      <form onSubmit={saveBrand}>
        <div className="flex gap-1">
          <input
            type="text"
            placeholder={'nom'}
            onChange={ev => setName(ev.target.value)}
            value={name}/>
        </div>

        <div className="mt-2">
        <input type="text" placeholder="lien d'image" value={image} onChange={ev=> setImage(ev.target.value)}/>
        <Image src={image} alt={`Image`} width={75} height={75} />
        </div>
        <div className="mb-2">
          Voir sur Acceuil?
          <select value={featured} placeholder="Non" onChange={ev=> setFeatured(ev.target.value)}>Non
          <option value={false}>Non</option>
          <option value={true}>Oui</option>

                </select>
        </div>
        <div className="my-10 text-slate-200 flex justify-center gap-2 ">
          {editedBrand && (
            <button
              type="button"
              onClick={() =>  {
                setEditedBrand(null);
                setFeatured(false);
                setName('');
                setImage('');
              }}
              className="bg-gray-700 rounded-lg text-gray-300 px-3 ">Cancel</button>
          )}
          <div>

          </div>
          <button type="submit"
                  className="bg-emerald-500 rounded-lg py-2 text-xl  w-4/6">
            Sauvegarder
          </button>
        </div>
      </form>
      {!editedBrand && (
        <table className="basic mt-4">
          <thead>
          <tr>
            <td>Nom de marque</td>
            <td >Logo</td>
            <td>Voir on Acceuil?</td>
            <td>Modifier</td>
            <td>Supprimer</td>
          </tr>
          </thead>
          <tbody>
          {brands.length > 0 && brands.map(brand => (
            <tr key={brand._id}>
              <td>{brand.name}</td>
              <td><Image src= {brand?.image} alt="brand" width={100} height={100}></Image></td>
              <td><select onChange={async (ev) => {
          await axios.put('/api/brands?id=' + brand._id, { ...brand,featured:ev.target.value,});
          axios.get('/api/brands').then(  response =>{
            setBrands(response.data);});
        }}   value={brand.featured}>

              <option value={false}>Non</option>
              <option value={true}>Oui</option>
                </select></td>
              <td>
                <button
                  onClick={() => editBrand(brand)}
                  className="btnn "
                >
                  <svg className=" w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5">
  <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
</svg>
                </button>

              </td>
              <td><button
                  onClick={() => deleteBrand(brand)}
                  className="del"><svg className=" w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg></button></td>
            </tr>
          ))}
          </tbody>
        </table>
      )}
    </Layout>
  );
}
