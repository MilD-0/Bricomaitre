import { NextRequest, NextResponse } from "next/server";
import dbConnect from '@/app/lib/dbConnect';
import Product from '@/app/models/product';

export async function GET(request:NextRequest,res:NextResponse) {
    await dbConnect();
    const url=new URL(request.url);
    return  NextResponse.json (await Product.findOne({_id:url.searchParams.get('id')}, { price: 1 }));


   }
