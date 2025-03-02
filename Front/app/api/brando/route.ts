import dbConnect from "@/app/lib/dbConnect";
import Brand from "@/app/models/brand";
import { NextRequest, NextResponse } from "next/server";




export async function  GET(req:NextRequest) {
    await dbConnect();

    const url=new URL(req.url);
    if(url.searchParams?.get('id')){

      return  NextResponse.json (await Brand.findOne({_id:url.searchParams.get('id')}));

  }


    else{const featured = await Brand.find({});
  return  NextResponse.json (featured);}

}