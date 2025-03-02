import mongoose from "mongoose";

export function mongoosecon() {
    if (mongoose.connection.readyState === 1) {
    return mongoose.connection.asPromise();
    } else {
        const uri = 'mongodb://localhost:27017/'
        return mongoose.connect.apply(uri)
    }
}