import dbConnect from "@/app/lib/dbConnect";
import Product from "@/app/models/product";
import { NextRequest, NextResponse } from "next/server";


export async function  GET(req:NextRequest ,  ) {
    await dbConnect();
    const url=new URL(req.url);
    if(url.searchParams?.get('featured')){

      return  NextResponse.json (await Product.find({featured:true}));

  }else{

  return  NextResponse.json ("erroe");}}
