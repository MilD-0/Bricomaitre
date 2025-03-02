import mongoose ,{ Schema, Document,} from "mongoose";



const CategorySchema:Schema = new mongoose.Schema({
    name: {type:String,required:true},
    name_en: {type:String,},
    name_ar: {type:String,},
    image: {type:String,},
  parent: {type:mongoose.Types.ObjectId, ref:'Category'},
  properties: [{type:Object}],
  featured: {type:Boolean},
})


const Category = mongoose.models.Category || mongoose.model('Category', CategorySchema);
export default Category;