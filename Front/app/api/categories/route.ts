import dbConnect from "@/app/lib/dbConnect";
import Category from "@/app/models/category";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  await dbConnect();

  const url = new URL(req.url);
  if (url.searchParams?.get("featured")) {
    return NextResponse.json(await Category.find({ featured: true }));
  } else if (url.searchParams?.get("categoryid")) {
    return NextResponse.json(
      await Category.findOne({ _id: url.searchParams.get("id") })
    );
  } else {
    const categories = await Category.find({});
    return NextResponse.json(categories);
  }
}
