import dbConnect from "@/app/lib/dbConnect";
import Order from "@/app/models/order";
import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "../../lib/auth";

export async function GET(req: NextRequest) {
  await dbConnect();
  await isAdmin();

  const orders = await Order.find().sort({ createdAt: -1 });
  return NextResponse.json(orders);
}

export async function DELETE(req: NextRequest, res: NextResponse) {
  await dbConnect();
  await isAdmin();

  const url = new URL(req.url);

  if (url.searchParams?.get("id")) {
    return NextResponse.json(
      await Order.deleteOne({ _id: url.searchParams.get("id") })
    );
  }
}

export async function PUT(req: NextRequest, res: NextResponse) {
  await dbConnect();
  await isAdmin();
  const url = new URL(req.url);
  if (url.searchParams?.get("id")) {
    const {
      firstName,
      lastName,
      state,
      city,
      homeAddress,
      email,
      phoneNumber1,
      phoneNumber2,
      cartProducts,
      delivery,
      del_pr,
      price,
      confirmed,
      note,
      _id,
      variant,
    } = await req.json();
    await Order.updateOne(
      { _id },
      {
        firstName,
        lastName,
        state,
        city,
        homeAddress,
        email,
        phoneNumber1,
        phoneNumber2,
        cartProducts,
        delivery,
        confirmed,
        note,
        del_pr,
        variant,
        price,
      }
    );
    return NextResponse.json({ message: "Order edited" });
  }
}
