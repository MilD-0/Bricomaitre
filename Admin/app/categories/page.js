"use client"
import Layout from "../components/layout";
import {useEffect, useState} from "react";
import axios from "axios";
import Swal from 'sweetalert2'
import Image from "next/image";
import { set } from "mongoose";

export default function Categories() {
  const [editedCategory, setEditedCategory] = useState(null);
  const [name,setName] = useState('');
  const [name_en,setName_en] = useState('');
  const [name_ar,setName_ar] = useState('');
  const [parentCategory,setParentCategory] = useState('');
  const [featured,setFeatured] = useState(false);
  const [categories,setCategories] = useState([]);
  const [properties,setProperties] = useState([]);
  const [image, setImage] =useState('');
  useEffect(() => {
    fetchCategories();
  }, [])
  function fetchCategories() {
    axios.get('/api/categories').then(result => {
      setCategories(result.data);
    });
  }
  async function saveCategory(ev){
    ev.preventDefault();
    const data = {
      name,
      name_en,
      name_ar,
      featured,
      parentCategory,
      image,
      properties:properties.map(p => ({
        name:p.name,

        values:p.values.split(','),
      })),
    };
    if (editedCategory) {
      data._id = editedCategory._id;
      await axios.put('/api/categories', data);
      setEditedCategory(null);
    } else {
      await axios.post('/api/categories', data);
    }
    setName('');
    setName_en('');
    setName_ar('');
    setFeatured(false);
    setParentCategory('');
    setProperties([]);
    setImage('');
    fetchCategories();
  }
  function editCategory(category){
    setEditedCategory(category);
    setName(category.name);
    setName_en(category.name_en);
    setName_ar(category.name_ar);
    setImage(category.image);
    setFeatured(category.featured)

    setParentCategory(category.parent?._id);
    setProperties(
      category.properties.map(({name,values}) => ({
      name,
      values:values.join(',')
    }))
    );
  }
  function deleteCategory(category){
    Swal.fire({
      title: 'Confiramtion',
      text: `Supprimer ${category.name}?`,
      showCancelButton: true,
      cancelButtonText: 'Non',
      confirmButtonText: 'Oui',
      confirmButtonColor: '#d55',
      background: '#e5e7eb' ,
      reverseButtons: true,
      icon:"question",
    }).then(async result => {
      if (result.isConfirmed) {
        const {_id} = category;
        await axios.delete('/api/categories?id='+_id);
        fetchCategories();
      }
    });
  }
  function addProperty() {
    setProperties(prev => {
      return [...prev, {name:'',values:''}];
    });
  }
  function handlePropertyNameChange(index,property,newName) {
    setProperties(prev => {
      const properties = [...prev];
      properties[index].name = newName;
      return properties;
    });
  }
  function handlePropertyValuesChange(index,property,newValues) {
    setProperties(prev => {
      const properties = [...prev];
      properties[index].values = newValues;
      return properties;
    });
  }
  function removeProperty(indexToRemove) {
    setProperties(prev => {
      return [...prev].filter((p,pIndex) => {
        return pIndex !== indexToRemove;
      });
    });
  }
  return (
    <Layout>
      <h1 className="titel mb-8">Categories</h1>
      <label className="text-lg">
        {editedCategory
          ? `Modifier catégorie ${editedCategory.name}`
          : 'Creé une nouvelle catégorie'}
      </label>
      <form onSubmit={saveCategory}>
        <div className="flex gap-1">
          <input
            type="text"
            placeholder={'nom'}
            onChange={ev => setName(ev.target.value)}
            value={name}/>
            <input
            type="text"
            placeholder={'nom en'}
            onChange={ev => setName_en(ev.target.value)}
            value={name_en}/>
            <input
            type="text"
            placeholder={'nom ar'}
            onChange={ev => setName_ar(ev.target.value)}
            value={name_ar}/>
        </div>
        <div>
        <select className="  rounded-lg bg-white border-2 border-gray-300"
                  onChange={ev => setParentCategory(ev.target.value)}
                  value={parentCategory}>
            <option  value="">sans catégorie paternelle</option>
            {categories.length > 0 && categories.map(category => (
              <option key={category._id} value={category._id}>{category.name}</option>
            ))}
          </select>
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
        <div className="mb-2">
          <label className="text-lg block  mt-6">Propriétés</label>
          <button
            onClick={addProperty}
            type="button"
            className="btn-sec py-1 mb-5  ">
            nouvelle propriété
          </button>
          {properties.length > 0 && properties.map((property,index) => (
            <div key={index} className="flex gap-1 mb-2">
              <input type="text"
                     value={property.name}
                     className="mb-0"
                     onChange={ev => handlePropertyNameChange(index,property,ev.target.value)}
                     placeholder=" nom (example: couleur)"/>
              <input type="text"
                     className="mb-0"
                     onChange={ev =>
                       handlePropertyValuesChange(
                         index,
                         property,ev.target.value
                       )}
                     value={property.values}
                     placeholder="valeurs, séparées par des virgules"/>
              <button
                onClick={() => removeProperty(index)}
                type="button"
                className="btn-red py-1">
                Retirer
              </button>
            </div>
          ))}
        </div>
        <div className="my-10 text-slate-200 flex justify-center gap-2 ">
          {editedCategory && (
            <button
              type="button"
              onClick={() =>  {
                setEditedCategory(null);
                setFeatured(false);
                setName('');
                setName_en('');
                setName_ar('');
                setParentCategory('');
                setProperties([]);
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
      {!editedCategory && (
        <table className="basic mt-4">
          <thead>
          <tr>
            <td>Nom de catégorie</td>
            <td >Catégorie paternelle</td>
            <td>Voir on Acceuil?</td>
            <td>Modifier</td>
            <td>Supprimer</td>
          </tr>
          </thead>
          <tbody>
          {categories.length > 0 && categories.map(category => (
            <tr key={category._id}>
              <td>{category.name}</td>
              <td>{category?.parent?.name}</td>


              <td><select onChange={async (ev) => {
          await axios.put('/api/categories?id=' + category._id, { ...category,featured:ev.target.value,});
          axios.get('/api/categories').then(  response =>{
            setCategories(response.data);});
        }}   value={category.featured}>

              <option value={false}>Non</option>
              <option value={true}>Oui</option>
                </select></td>
              <td>
                <button
                  onClick={() => editCategory(category)}
                  className="btnn "
                >
                  <svg className=" w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5">
  <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
</svg>
                </button>

              </td>
              <td><button
                  onClick={() => deleteCategory(category)}
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
