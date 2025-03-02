import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/app/lib/dbConnect";
import Product from "@/app/models/product";

export async function POST(request: NextRequest, res: NextResponse) {
  await dbConnect();
  //await isAdmin();

  const { ids } = await request.json();

  return NextResponse.json(await Product.find({ _id: ids }));
}
