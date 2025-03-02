import dbConnect from "@/app/lib/dbConnect";
import Brand from "@/app/models/brand";
import { NextRequest, NextResponse } from "next/server";




export async function  GET(req:NextRequest) {
    await dbConnect();

    const url=new URL(req.url);
    if(url.searchParams?.get('featured')){

      return  NextResponse.json (await Brand.find({featured:true}));

  }else{
  const brands = await Brand.find({});
  return  NextResponse.json (brands);}

}