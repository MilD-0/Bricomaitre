import dbConnect from "@/app/lib/dbConnect";
import Featured from "@/app/models/featured";
import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "../../lib/auth";

export async function  GET(req:NextRequest) {
    await dbConnect();
   await isAdmin();
    const url=new URL(req.url);
    if(url.searchParams?.get('id')){

      return  NextResponse.json (await Featured.findOne({_id:url.searchParams.get('id')}));

  }


    else{const featured = await Featured.find({});
  return  NextResponse.json (featured);}

}



export async function POST(request:NextRequest) {
 await dbConnect();
 await isAdmin();
 const {title1,title2,phrase,title1en,title2en,phraseen,title1ar,title2ar,phrasear,image,link}= await request.json();
 try {
    Featured.create({title1,title2,phrase,title1en,title2en,phraseen,title1ar,title2ar,phrasear,image,link})
  return  NextResponse.json ({message: 'feature created'});
 }catch(err:any) {
  return  NextResponse.json({error:err.message})
 }
}

export async function PUT(request:NextRequest, res:NextResponse) {
   await dbConnect();


   const {title1,title2,phrase,title1en,title2en,phraseen,title1ar,title2ar,phrasear, _id,image,link}= await request.json();
   await Featured.updateOne({_id},{title1,title2,phrase,title1en,title2en,phraseen,title1ar,title2ar,phrasear,image,link});
   return  NextResponse.json ({message: 'feature edited'});

}

export async function  DELETE(req:NextRequest, res:NextResponse ) {
   await dbConnect();


   const url=new URL(req.url);

   if(url.searchParams?.get('id')){

       return  NextResponse.json (await Featured.deleteOne({_id:url.searchParams.get('id')}));

   }}