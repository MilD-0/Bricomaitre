import dbConnect from "@/app/lib/dbConnect";
import Product from "@/app/models/product";
import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "../../lib/auth";

export async function GET(req: NextRequest) {
  await dbConnect();
  await isAdmin();

  const url = new URL(req.url);
  if (url.searchParams?.get("id")) {
    return NextResponse.json(
      await Product.findOne({ _id: url.searchParams.get("id") })
    );
  } else {
    const products = await Product.find({});
    return NextResponse.json(products);
  }
}

export async function POST(request: NextRequest, res: NextResponse) {
  await dbConnect();
  await isAdmin();

  const {
    title,
    by,
    description,
    title_en,
    brand,
    description_en,
    title_ar,
    featured,
    description_ar,
    specDescs,
    specDescs_ar,
    specIcons,
    specValues,
    summary,
    summary_ar,
    summary2,
    summary2_ar,
    color,
    vidlink,
    price,
    images,
    features,
    features_ar,
    category,
    properties,
    stock,
    variants,
  } = await request.json();
  try {
    Product.create({
      title,
      by,
      description,
      title_en,
      description_en,
      title_ar,
      specDescs,
      specDescs_ar,
      specIcons,
      specValues,
      featured,
      brand: brand || null,
      summary,
      summary_ar,
      summary2,
      summary2_ar,
      color,
      vidlink,
      description_ar,
      price,
      stock,
      images,
      features,
      features_ar,
      category: category || null,
      properties,
      variants,
    });
    return NextResponse.json({ message: "product created" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message });
  }
}

export async function PUT(request: NextRequest, res: NextResponse) {
  await dbConnect();
  await isAdmin();

  const {
    title,
    description,
    by,
    title_en,
    description_en,
    title_ar,
    brand,
    stock,
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
    images,
    features,
    features_ar,
    category,
    properties,
    featured,
    _id,
    variants,
  } = await request.json();
  await Product.updateOne(
    { _id },
    {
      title,
      by,
      description,
      title_en,
      stock,
      specDescs,
      specDescs_ar,
      specIcons,
      specValues,
      description_en,
      summary,
      summary_ar,
      summary2,
      summary2_ar,
      color,
      vidlink,
      title_ar,
      features,
      features_ar,
      description_ar,
      price,
      featured,
      brand: brand || null,
      images,
      category: category || null,
      properties,
      variants,
    }
  );
  return NextResponse.json({ message: "product edited" });
}

export async function DELETE(req: NextRequest, res: NextResponse) {
  await dbConnect();
  await isAdmin();

  const url = new URL(req.url);

  if (url.searchParams?.get("id")) {
    return NextResponse.json(
      await Product.deleteOne({ _id: url.searchParams.get("id") })
    );
  }
}
