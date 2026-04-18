import mongoose, { Schema } from "mongoose";

const OrderSchema: Schema = new mongoose.Schema(
  {
    firstName: { type: String },
    lastName: { type: String },
    state: { type: String },
    city: { type: String },
    homeAddress: { type: String },
    email: { type: String },
    phoneNumber1: { type: Number, required: true },
    phoneNumber2: { type: Number },
    cartProducts: [{ type: String }],
    delivery: { type: String },
    del_pr: { type: Number },
    price: { type: Number },
    confirmed: { type: String },
    variant: { type: String },
  },
  {
    timestamps: true,
  }
);

const Order = mongoose.models.Order || mongoose.model("Order", OrderSchema);
export default Order;
