import mongoose, { Schema, Document } from "mongoose";

const ProductSchema: Schema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String },
    title_en: { type: String },
    description_en: { type: String },
    title_ar: { type: String },
    description_ar: { type: String },
    OldPrice: { type: Number },
    summary: { type: String },
    summary_ar: { type: String },
    summary2: { type: String },
    summary2_ar: { type: String },
    vidlink: { type: String },
    color: { type: String },
    price: { type: Number, required: true },
    images: [{ type: String }],
    brand: { type: mongoose.Types.ObjectId, ref: "Brand" },
    stock: { type: Number },
    category: { type: mongoose.Types.ObjectId, ref: "Category" },
    features: [{ type: String }],
    features_ar: [{ type: String }],
    featured: { type: Boolean },
    specDescs: [{ type: String }],
    specDescs_ar: [{ type: String }],
    specIcons: [{ type: String }],
    specValues: [{ type: String }],

    properties: { type: Object },
  },
  {
    timestamps: true,
  }
);

const Product =
  mongoose.models.Product || mongoose.model("Product", ProductSchema);
export default Product;
