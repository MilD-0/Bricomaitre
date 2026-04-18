import mongoose ,{ Schema,} from "mongoose";




const BrandSchema:Schema = new mongoose.Schema({
    name: {type:String,required:true},
    image: {type:String,},
    featured: {type:Boolean},

})


const Brand = mongoose.models.Brand || mongoose.model('Brand', BrandSchema);
export default Brand;