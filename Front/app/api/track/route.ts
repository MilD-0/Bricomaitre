import dbConnect from "@/app/lib/dbConnect";
import Product from "@/app/models/product";
import { create } from "domain";
import { NextRequest, NextResponse } from "next/server";
import  Category  from "@/app/models/category";
import { ObjectId } from "mongodb";



export async function  GET(req:NextRequest ,  ) {
    await dbConnect();


    const url=new URL(req.url);


    const category = url.searchParams?.get('category') as string;
    const childCategory = url.searchParams?.get('childCategory') as string;
    const brand = url.searchParams?.get('brand') as string;










    interface Filter {

        category?: any;
        brand?: string;

    }

    const filter: Filter = {};



if (category && category !== '' && category !== 'tous') {
  if (childCategory && childCategory !== '' && childCategory !== 'tous') {
    filter.category = childCategory}else{
  const parentCategory = await Category.findById(category);
  const childCategories = await Category.find({ parent: parentCategory?._id });



  // Include all child category IDs in the filter
  const categoryIds:any  = [category, ...childCategories.map(child => child._id)];
  filter.category = { $in: categoryIds }}
}






        if (brand){

            const products = await Product.aggregate([

                {$match: {brand: new ObjectId(brand)}},
                    {$sample : {size : 15}}
                ]);
                return NextResponse.json({ products });
        }
        else if (category){
            const products = await Product.aggregate([

                {$match: {category: new ObjectId(category)}},
                    {$sample : {size : 15}}
                ]);
                return NextResponse.json({ products });
        }
        else return NextResponse.json("Error fetching")








}
