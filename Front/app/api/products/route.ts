import dbConnect from "@/app/lib/dbConnect";
import Product from "@/app/models/product";
import { NextRequest, NextResponse } from "next/server";


export async function  GET(req:NextRequest ,  ) {
    await dbConnect();
    const url=new URL(req.url);
    const query = url.searchParams?.get('search') as string;
    const regex = new RegExp(`.*${query}.*`, 'i');
    interface Filter {
        title?: { $regex: RegExp };
        category?: string;
        brand?: string;
        stock?: { $gt: number };
    }

    const filter: Filter = {};

    if (query && query !== '') {
        filter.title = { $regex: regex };
      }
      filter.stock = { $gt: 0 };



    const page: number | undefined = parseInt(url.searchParams?.get('page') as string, 10);
    let offset = (page - 1) * 6;

    let limita: number | undefined = parseInt(url.searchParams?.get('limit') as string, 10);
    if(url.searchParams?.get('id')){

        return  NextResponse.json (await Product.findOne({_id:url.searchParams.get('id')}));

    }


    else{

        if (isNaN(limita)) {
            limita = 6

        }
        const count = await Product.countDocuments();
    const products = await Product.find(filter).limit(limita)?.sort({title: 1})?.skip(offset);
        return  NextResponse.json( products,);

}}
