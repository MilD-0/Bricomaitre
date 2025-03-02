import dbConnect from "@/app/lib/dbConnect";
import Product from "@/app/models/product";
import { create } from "domain";
import { NextRequest, NextResponse } from "next/server";
import  Category  from "@/app/models/category";



export async function  GET(req:NextRequest ,  ) {
    await dbConnect();


    const url=new URL(req.url);
    const page: number | undefined = parseInt(url.searchParams?.get('page') as string, 10);
    const query = url.searchParams?.get('search') as string;
    const category = url.searchParams?.get('category') as string;
    const childCategory = url.searchParams?.get('childCategory') as string;
    const brand = url.searchParams?.get('brand') as string;
    const instock = url.searchParams?.get('instock') as string;
    const dbb = query?.toString();

    const regex = new RegExp(`.*${query}.*`, 'i');
    let limita: number | undefined = parseInt(url.searchParams?.get('limit') as string, 10);
    let offset = (page - 1) * limita;
    const sortby = url.searchParams?.get('sortby') as string;

    var sort
    if (sortby === "price") {
    sort = '{"price" : 1}'
    }else if (sortby === "-price"){
         sort = '{"price" : -1}'
    }else if (sortby === "name"){
         sort = '{"title" : 1}'
    }else if (sortby === "-price"){
        sort = '{"title" : -1}'
    }else  sort = '{"createdAt" : -1}'


    interface Filter {
        title?: { $regex: RegExp };
        category?: any;
        brand?: string;
        stock?: { $gt: number };
    }

    const filter: Filter = {};

if (query && query !== '') {
  filter.title = { $regex: regex };
}

if (category && category !== '' && category !== 'tous') {
  if (childCategory && childCategory !== '' && childCategory !== 'tous') {
    filter.category = childCategory}else{
  const parentCategory = await Category.findById(category);
  const childCategories = await Category.find({ parent: parentCategory?._id });



  // Include all child category IDs in the filter
  const categoryIds:any  = [category, ...childCategories.map(child => child._id)];
  filter.category = { $in: categoryIds }}
}

if (brand && brand !== '' && brand !== 'tous') {
  filter.brand = brand;
}
if( instock === 'true'){
    filter.stock = { $gt: 0 };
}






            const products = await Product.find(filter).limit(limita);
            const count = await Product.countDocuments(filter);
            if (count > 6) {
              return NextResponse.json({ products,count });
            }
            else {
              return NextResponse.json(null);
            }







}
