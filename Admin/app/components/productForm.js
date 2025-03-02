import React, { useEffect, useState } from "react";
import axios from "axios";
import { redirect } from "next/navigation";
import { HexColorPicker } from "react-colorful";

import Image from "next/image";
export default function ProductForm({
  _id,
  title: existingTitle,
  description: existingDescription,
  title_en: existingTitle_en,
  description_en: existingDescription_en,
  title_ar: existingTitle_ar,
  description_ar: existingDescription_ar,
  summary: existingSummary,
  summary_ar: existingSummary_ar,
  summary2: existingSummary2,
  summary2_ar: existingSummary2_ar,
  price: existingPrice,
  images: existingImages,
  features: existingFeatures,
  features_ar: existingFeatures_ar,
  category: assignedCategory,
  brand: assignedBrand,
  properties: assignedProperties,
  vidlink: existingVidlink,
  specIcons: existingSpecIcons,
  specValues: existingSpecValues,
  specDescs: existingSpecDescs,
  specDescs_ar: existingSpecDescs_ar,
  Color: existingColor,
  featured: existingFeatured,
  variants: existingVariants,
  stock: existingStock,
}) {
  const [title, setTitle] = useState(existingTitle || "");
  const [description, setDescription] = useState(existingDescription || "");
  const [featured, setFeatured] = useState(existingFeatured || false);
  const [title_en, setTitle_en] = useState(existingTitle_en || "");
  const [description_en, setDescription_en] = useState(
    existingDescription_en || ""
  );
  const [title_ar, setTitle_ar] = useState(existingTitle_ar || "");
  const [description_ar, setDescription_ar] = useState(
    existingDescription_ar || ""
  );
  const [summary, setSummary] = useState(existingSummary || "");
  const [summary_ar, setSummary_ar] = useState(existingSummary_ar || "");
  const [summary2, setSummary2] = useState(existingSummary2 || "");
  const [summary2_ar, setSummary2_ar] = useState(existingSummary2_ar || "");
  const [color, setColor] = useState(existingColor || "");
  const [vidlink, setVidlink] = useState(existingVidlink || "");
  const [specIcons, setSpecIcons] = useState(existingSpecIcons || []);
  const [specValues, setSpecValues] = useState(existingSpecValues || []);
  const [specDescs, setSpecDescs] = useState(existingSpecDescs || []);
  const [specDescs_ar, setSpecDescs_ar] = useState(existingSpecDescs_ar || []);
  const [category, setCategory] = useState(assignedCategory || "");
  const [brand, setBrand] = useState(assignedBrand || "");
  const [productProperties, setProductProperties] = useState(
    assignedProperties || {}
  );
  const [price, setPrice] = useState(existingPrice || "");
  const [images, setImages] = useState(existingImages || []);
  const [features, setFeatures] = useState(existingFeatures || []);
  const [features_ar, setFeatures_ar] = useState(existingFeatures_ar || []);
  const [goToProducts, setgoToProducts] = useState(false);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [variants, setVariants] = useState(existingVariants || []);
  const [variantName, setVariantName] = useState("");
  const [variantChoice, setVariantChoice] = useState("");
  const [variantPrice, setVariantPrice] = useState("");
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(null);
  const [editingVariantIndex, setEditingVariantIndex] = useState(null);
  const [editingChoiceIndex, setEditingChoiceIndex] = useState(null);
  const [stock, setStock] = useState(existingStock || "100");
  const [files, setFiles] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showVariantInputs, setShowVariantInputs] = useState(false);
  const [showChoiceInputs, setShowChoiceInputs] = useState(false);
  const handleFileChange = (e) => {
    setFiles([...e.target.files]);
    console.log(files);
  };
  console.log(color);
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!files) return;

    setUploading(true);
    const formData = new FormData();
    for (const file of files) {
      formData.append("file", file);
    }
    console.log(formData.getAll("file"));

    try {
      const response = await axios.post(
        "/api/upload",

        formData
      );

      const data = response.data;
      setImages((prev) => [...prev, ...data.uploadedFiles]);
      setUploading(false);
    } catch (error) {
      setUploading(false);
    }
  };

  useEffect(() => {
    axios.get("/api/categories").then((result) => {
      setCategories(result.data);
    });
  }, []);

  useEffect(() => {
    axios.get("/api/brands").then((result) => {
      setBrands(result.data);
    });
  }, []);
  async function saveProduct(ev) {
    ev.preventDefault();
    const filteredImages = images.filter((image) => image !== "");
    const filteredFeatures = features.filter((feature) => feature !== "");
    const filteredFeatures_ar = features_ar.filter(
      (feature_ar) => feature_ar !== ""
    );
    const data = {
      featured,
      title,
      description,
      title_en,
      description_en,
      title_ar,
      specDescs,
      specDescs_ar,
      specIcons,
      specValues,
      description_ar,
      summary,
      summary_ar,
      summary2,
      summary2_ar,
      color,
      vidlink,
      price,
      brand,
      stock,
      images: filteredImages,
      category,
      features: filteredFeatures,
      features_ar: filteredFeatures_ar,
      properties: productProperties,
      variants,
    };
    if (_id) {
      await axios.put("/api/products", { ...data, _id });
      setgoToProducts(true);
    } else {
      await axios.post("/api/products", data);
      setgoToProducts(true);
    }
  }
  if (goToProducts) {
    return redirect("/products");
  }

  function setProductProp(propName, value) {
    setProductProperties((prev) => {
      const newProductProps = { ...prev };
      newProductProps[propName] = value;
      return newProductProps;
    });
  }

  const propertiesToFill = [];
  if (categories.length > 0 && category) {
    let catInfo = categories.find(({ _id }) => _id === category);
    propertiesToFill.push(...catInfo.properties);
    while (catInfo?.parent?._id) {
      const parentCat = categories.find(
        ({ _id }) => _id === catInfo?.parent?._id
      );
      propertiesToFill.push(...parentCat.properties);
      catInfo = parentCat;
    }
  }

  const addImage = (ev) => {
    setImages([...images, ""]);
    ev.preventDefault();
  };
  const addFeature = (ev) => {
    setFeatures([...features, ""]);
    setFeatures_ar([...features_ar, ""]);
    ev.preventDefault();
  };
  const addSpec = (ev) => {
    setSpecDescs([...specDescs, ""]);
    setSpecDescs_ar([...specDescs_ar, ""]);
    setSpecIcons([...specIcons, ""]);
    setSpecValues([...specValues, ""]);
    ev.preventDefault();
  };

  const handleInputChange = (index, event) => {
    let values = [...images];
    values[index] = event.target.value;
    setImages(values);
  };
  const handleInputChange2 = (index, event) => {
    let values = [...features];
    values[index] = event.target.value;
    setFeatures(values);
  };
  const handleInputChange3 = (index, event) => {
    let values_ar = [...features_ar];
    values_ar[index] = event.target.value;
    setFeatures_ar(values_ar);
  };
  const handleInputChange4 = (index, event) => {
    let values1 = [...specDescs];
    values1[index] = event.target.value;
    setSpecDescs(values1);
  };
  const handleInputChange5 = (index, event) => {
    let values2 = [...specDescs_ar];
    values2[index] = event.target.value;
    setSpecDescs_ar(values2);
  };
  const handleInputChange6 = (index, event) => {
    let values3 = [...specIcons];
    values3[index] = event.target.value;
    setSpecIcons(values3);
  };
  const handleInputChange7 = (index, event) => {
    let values4 = [...specValues];
    values4[index] = event.target.value;
    setSpecValues(values4);
  };

  const addVariant = () => {
    if (variantName) {
      setVariants([...variants, { name: variantName, choices: [] }]);
      setVariantName("");
      setShowVariantInputs(false);
    }
  };

  const addVariantChoice = () => {
    if (selectedVariantIndex !== null && variantChoice) {
      const newVariants = [...variants];
      newVariants[selectedVariantIndex].choices.push({
        choice: variantChoice,
        price: variantPrice,
      });
      setVariants(newVariants);
      setVariantChoice("");
      setVariantPrice("");
      setShowChoiceInputs(false);
    }
  };

  const editVariant = (index) => {
    setVariantName(variants[index].name);
    setEditingVariantIndex(index);
    setShowVariantInputs(true);
  };

  const saveVariant = () => {
    if (editingVariantIndex !== null) {
      const newVariants = [...variants];
      newVariants[editingVariantIndex].name = variantName;
      setVariants(newVariants);
      setVariantName("");
      setEditingVariantIndex(null);
      setShowVariantInputs(false);
    }
  };

  const deleteVariant = (index) => {
    const newVariants = variants.filter((_, i) => i !== index);
    setVariants(newVariants);
  };

  const editChoice = (variantIndex, choiceIndex) => {
    setVariantChoice(variants[variantIndex].choices[choiceIndex].choice);
    setVariantPrice(variants[variantIndex].choices[choiceIndex].price);
    setSelectedVariantIndex(variantIndex);
    setEditingChoiceIndex(choiceIndex);
    setShowChoiceInputs(true);
  };

  const saveChoice = () => {
    if (selectedVariantIndex !== null && editingChoiceIndex !== null) {
      const newVariants = [...variants];
      newVariants[selectedVariantIndex].choices[editingChoiceIndex] = {
        choice: variantChoice,
        price: variantPrice,
      };
      setVariants(newVariants);
      setVariantChoice("");
      setVariantPrice("");
      setEditingChoiceIndex(null);
      setShowChoiceInputs(false);
    }
  };

  const deleteChoice = (variantIndex, choiceIndex) => {
    const newVariants = [...variants];
    newVariants[variantIndex].choices = newVariants[
      variantIndex
    ].choices.filter((_, i) => i !== choiceIndex);
    setVariants(newVariants);
  };
  return (
    <form onSubmit={saveProduct} className="my-8">
      <label className="text-xl ">Nom du produit</label>
      <input
        type="text"
        placeholder="nom"
        value={title}
        onChange={(ev) => setTitle(ev.target.value)}
      />
      <label className="text-xl ">Nom du produit EN</label>
      <input
        type="text"
        placeholder="nom en"
        value={title_en}
        onChange={(ev) => setTitle_en(ev.target.value)}
      />
      <label className="text-xl ">Nom du produit AR</label>
      <input
        className="mb-6"
        type="text"
        placeholder="nom ar"
        value={title_ar}
        onChange={(ev) => setTitle_ar(ev.target.value)}
      />
      <label className="text-xl ">Marque</label>
      <select
        className=" mb-3 rounded-lg bg-white border-2 border-gray-300"
        value={brand}
        onChange={(ev) => setBrand(ev.target.value)}
      >
        <option value="">Sans marque</option>
        {brands.length > 0 &&
          brands.map((b) => (
            <option key={b._id} value={b._id}>
              {b.name}
            </option>
          ))}
      </select>
      <label className="text-xl mr-3">Catégorie</label>
      <select
        className=" mb-3 rounded-lg bg-white border-2 border-gray-300"
        value={category}
        onChange={(ev) => setCategory(ev.target.value)}
      >
        <option value="">Sans catégorie</option>
        {categories.length > 0 &&
          categories.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
      </select>
      {propertiesToFill.length > 0 &&
        propertiesToFill.map((p) => (
          <div key={p.name} className="flex">
            <label className="mb-3 mr-2">
              {p.name[0].toUpperCase() + p.name.substring(1)}
            </label>
            <div>
              <select
                className="  rounded-lg bg-white border-2 border-gray-300 "
                value={productProperties[p.name]}
                onChange={(ev) => setProductProp(p.name, ev.target.value)}
              >
                {p.values.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      <label className="block mt-6 text-xl">Desription</label>
      <textarea
        className="mb-6"
        placeholder="description"
        value={description}
        onChange={(ev) => setDescription(ev.target.value)}
      ></textarea>
      <label className="block mt-6 text-xl">Desription EN</label>
      <textarea
        className="mb-6"
        placeholder="description en"
        value={description_en}
        onChange={(ev) => setDescription_en(ev.target.value)}
      ></textarea>
      <label className="block mt-6 text-xl">Desription AR</label>
      <textarea
        className="mb-6"
        placeholder="description ar"
        value={description_ar}
        onChange={(ev) => setDescription_ar(ev.target.value)}
      ></textarea>
      <label className="text-xl">Prix (en DZD)</label>
      <input
        required
        className="mb-6"
        type="number"
        placeholder="prix"
        value={price}
        onChange={(ev) => setPrice(ev.target.value)}
      />
      <label className="text-xl">Variantes</label>
      <div>
        <button
          type="button"
          onClick={() => setShowVariantInputs(true)}
          className="btn-sec mb-4"
        >
          Ajouter variante
        </button>
        {showVariantInputs && (
          <div>
            <input
              type="text"
              placeholder="Nom de la nouvelle variante"
              value={variantName}
              onChange={(e) => setVariantName(e.target.value)}
            />
            <button
              type="button"
              onClick={editingVariantIndex !== null ? saveVariant : addVariant}
              className="btn-sec mb-4"
            >
              {editingVariantIndex !== null
                ? "Enregistrer variante"
                : "Ajouter variante"}
            </button>
          </div>
        )}

        {variants.map((variant, index) => (
          <div key={index}>
            <h4>{variant.name}</h4>
            <button
              type="button"
              onClick={() => editVariant(index)}
              className="btn-sec mb-4"
            >
              Modifier
            </button>
            <button
              type="button"
              onClick={() => deleteVariant(index)}
              className="btn-sec mb-4"
            >
              Supprimer
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedVariantIndex(index);
                setShowChoiceInputs(true);
              }}
              className="btn-sec mb-4"
            >
              Ajouter choix
            </button>
            {showChoiceInputs && selectedVariantIndex === index && (
              <div>
                <input
                  type="text"
                  placeholder={"Choix de la variante " + variant.name}
                  value={variantChoice}
                  onChange={(e) => setVariantChoice(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Prix de la variante (optionnel)"
                  value={variantPrice}
                  onChange={(e) => setVariantPrice(e.target.value)}
                />
                <button
                  type="button"
                  onClick={
                    editingChoiceIndex !== null ? saveChoice : addVariantChoice
                  }
                  className="btn-sec mb-4"
                >
                  {editingChoiceIndex !== null
                    ? "Enregistrer choix"
                    : "Ajouter choix"}
                </button>
              </div>
            )}
            <ul>
              {variant.choices.map((choice, choiceIndex) => (
                <li key={choiceIndex}>
                  {choice.choice} {choice.price && `- ${choice.price}€`}
                  <button
                    type="button"
                    onClick={() => editChoice(index, choiceIndex)}
                    className="btn-sec mb-4"
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteChoice(index, choiceIndex)}
                    className="btn-sec mb-4"
                  >
                    Supprimer
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <h1 className="text-2xl text-emerald-600 ">Carte</h1>
      <div className="border-y-2 border-teal-700 mb-2">
        <div className="mt-2 text-lg">
          Voir comme carte?
          <select
            value={featured}
            placeholder="Non"
            onChange={(ev) => setFeatured(ev.target.value)}
          >
            Non
            <option value={false}>Non</option>
            <option value={true}>Oui</option>
          </select>
        </div>
        <label className="block mt-6 text-xl">Resume</label>
        <textarea
          className=""
          placeholder="resume...(moin que 20 mots)"
          value={summary}
          onChange={(ev) => setSummary(ev.target.value)}
        ></textarea>
        <label className="block  text-xl">Resume AR</label>
        <textarea
          className="mb-6"
          placeholder="resume..."
          value={summary_ar}
          onChange={(ev) => setSummary_ar(ev.target.value)}
        ></textarea>

        <label className="text-xl">Caracteristiques</label>
        <div>
          <button onClick={addFeature} className="btn-sec mb-4">
            Ajouter caracteristique{" "}
          </button>
          {features.map((feature, index) => (
            <div key={index}>
              FR
              <input
                type="text"
                placeholder="...(moins que 10 mots)"
                value={feature}
                onChange={(event) => handleInputChange2(index, event)}
              />
            </div>
          ))}
        </div>
        <div>
          {features_ar.map((feature_ar, index) => (
            <div key={index}>
              AR
              <input
                type="text"
                placeholder="...(ar)"
                value={feature_ar}
                onChange={(event) => handleInputChange3(index, event)}
              />
            </div>
          ))}
        </div>
      </div>
      <h1 className="text-2xl mt-8 text-emerald-600 ">Landing</h1>
      <div className="border-y-2 border-teal-700 mb-2">
        <label className="block mt-6 text-xl">Resume</label>
        <textarea
          className=""
          placeholder="resume...(moin que 40 mots)"
          value={summary2}
          onChange={(ev) => setSummary2(ev.target.value)}
        ></textarea>
        <label className="block  text-xl">Resume AR</label>
        <textarea
          className="mb-6"
          placeholder="resume..."
          value={summary2_ar}
          onChange={(ev) => setSummary2_ar(ev.target.value)}
        ></textarea>
        <label className="block  text-xl">Coleur du titre</label>
        <HexColorPicker color={color} onChange={setColor} />
        <label className="text-xl">Caracteristiques</label>
        <div>
          <button onClick={addSpec} className="btn-sec mb-4">
            Ajouter caracteristique{" "}
          </button>
          {specIcons.map((SpecIcon, index) => (
            <div key={index}>
              Icon {index + 1}
              <input
                type="text"
                placeholder=""
                value={SpecIcon}
                onChange={(event) => handleInputChange6(index, event)}
              />
            </div>
          ))}
          {specValues.map((SpecValue, index) => (
            <div key={index}>
              Valeur {index + 1}
              <input
                type="text"
                placeholder=""
                value={SpecValue}
                onChange={(event) => handleInputChange7(index, event)}
              />
            </div>
          ))}
          {specDescs.map((SpecDesc, index) => (
            <div key={index}>
              Description {index + 1}
              <input
                type="text"
                placeholder=""
                value={SpecDesc}
                onChange={(event) => handleInputChange4(index, event)}
              />
            </div>
          ))}
          {specDescs_ar.map((SpecDesc_ar, index) => (
            <div key={index}>
              Description AR {index + 1}
              <input
                type="text"
                placeholder=""
                value={SpecDesc_ar}
                onChange={(event) => handleInputChange5(index, event)}
              />
            </div>
          ))}
        </div>

        <label className="text-xl ">Lien de video</label>
        <input
          type="text"
          placeholder="facebook/"
          value={vidlink}
          onChange={(ev) => setVidlink(ev.target.value)}
        />
      </div>

      <label className="text-xl block">Photos</label>

      <div className="mb-2">
        <div>
          {images.map((image, index) => (
            <div key={index}>
              <input
                type="text"
                placeholder="lien de photo"
                value={image}
                onChange={(event) => handleInputChange(index, event)}
              />
              {image && (
                <Image
                  src={image}
                  alt={`Image ${index}`}
                  width={75}
                  height={75}
                />
              )}
            </div>
          ))}
        </div>
        <button onClick={addImage} className="btn-sec">
          Ajouter photo (par lien)
        </button>

        <div className="mt-4">
          <input
            multiple
            type="file"
            accept="image/*"
            onChange={handleFileChange}
          />
          {files?.length > 0 && (
            <button
              className="bg-emerald-500 my-10 text-slate-200 rounded-lg p-2 text-xl  w-40"
              onClick={handleSubmit}
              disabled={!files || uploading}
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>
          )}
        </div>
      </div>
      <div>
        <label className="text-xl">Quantité </label>
        <input
          className="mb-6"
          type="number"
          placeholder="stock"
          value={stock}
          onChange={(ev) => setStock(ev.target.value)}
        />
      </div>

      <button
        className="bg-emerald-500 my-10 text-slate-200 rounded-lg p-2 text-xl  w-full"
        type="submit"
      >
        Sauvegarder
      </button>
    </form>
  );
}
