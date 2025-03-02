import dbConnect from "@/app/lib/dbConnect";
import Category from "@/app/models/category";
import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "../../lib/auth";



export async function  GET() {
    await dbConnect();
    await isAdmin();


        return  NextResponse.json (await Category.find().populate('parent'));

}


export async function POST(request:NextRequest) {
 await dbConnect();
 await isAdmin();

 const {name,parentCategory,properties,name_en,name_ar,image,featured}= await request.json();
 try {
    Category.create({name,parent: parentCategory || null,properties,name_en,name_ar,image,featured})
  return  NextResponse.json ({message: 'category created'});
 }catch(err:any) {
  return  NextResponse.json({error:err.message})
 }
}


export async function PUT(request:any,) {
    await dbConnect();
    await isAdmin();

    const {name,name_en,name_ar,parentCategory,properties, _id,image,featured}= await request.json();
    await Category.updateOne({_id},{name,name_en,name_ar,parent: parentCategory || null,properties,image,featured});
    return  NextResponse.json ({message: 'category edited'});

}

export async function  DELETE(req:NextRequest ) {
    await dbConnect();
    await isAdmin();

    const url=new URL(req.url);

    if(url.searchParams?.get('id')){

        return  NextResponse.json (await Category.deleteOne({_id:url.searchParams.get('id')}));

    }}