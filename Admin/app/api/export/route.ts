import dbConnect from "@/app/lib/dbConnect";
import Order from "@/app/models/order";
import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "../../lib/auth";

export async function  GET(req:NextRequest ,  ) {
    await dbConnect();
    await isAdmin();

    const orders = await Order.find({confirmed:"yes"}).sort({createdAt:-1});
        return  NextResponse.json (orders,);

}