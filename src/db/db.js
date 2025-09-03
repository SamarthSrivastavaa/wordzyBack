import dotenv from "dotenv"
import mongoose from "mongoose"
dotenv.config()

const connectDB=async()=>{
    try {
        const connectionInstance=await mongoose.connect(`${process.env.MONGODB_URI}/${process.env.DB_NAME}`);
        console.log("connected db:");
    } catch (error) {
        console.log("Some error occured while connecting to the database",error.message);
    }
}

export default connectDB;