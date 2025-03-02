import mongoose ,{ Schema, } from "mongoose";



const FeaturedSchema:Schema = new mongoose.Schema({
    title1: { type: String, required:true },
    title2: { type: String,  },
    phrase: { type: String, required:true },
    title1en: { type: String,  },
    title2en: { type: String,},
    phraseen: { type: String, },
    title1ar: { type: String, },
    title2ar: { type: String, },
    phrasear: { type: String,  },
    link: { type: String,  },
    image: { type: String, required:true },
})


const Featured = mongoose.models.Featured || mongoose.model('Featured', FeaturedSchema);
export default Featured;