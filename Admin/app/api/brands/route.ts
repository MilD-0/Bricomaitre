import dbConnect from "@/app/lib/dbConnect";
import Brand from "@/app/models/brand";
import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "../../lib/auth";



export async function  GET() {
    await dbConnect();
    await isAdmin();


        return  NextResponse.json (await Brand.find());

}


export async function POST(request:NextRequest) {
 await dbConnect();
 await isAdmin();

 const {name,image,featured}= await request.json();
 try {
    Brand.create({name,image,featured})
  return  NextResponse.json ({message: 'Brand created'});
 }catch(err:any) {
  return  NextResponse.json({error:err.message})
 }
}


export async function PUT(request:any,) {
    await dbConnect();
    await isAdmin();

    const {name, _id,image,featured}= await request.json();
    await Brand.updateOne({_id},{name,image,featured});
    return  NextResponse.json ({message: 'Brand edited'});

}

export async function  DELETE(req:NextRequest ) {
    await dbConnect();
    await isAdmin();
    const url=new URL(req.url);

    if(url.searchParams?.get('id')){

        return  NextResponse.json (await Brand.deleteOne({_id:url.searchParams.get('id')}));

    }}