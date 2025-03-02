import dbConnect from "@/app/lib/dbConnect";
import Featured from "@/app/models/featured";
import { NextRequest, NextResponse } from "next/server";


export async function  GET(req:NextRequest) {
    await dbConnect();

    const url=new URL(req.url);
    if(url.searchParams?.get('id')){

      return  NextResponse.json (await Featured.findOne({_id:url.searchParams.get('id')}));

  }


    else{const featured = await Featured.find({});
  return  NextResponse.json (featured);}

}
