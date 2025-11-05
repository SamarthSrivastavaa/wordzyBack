import dotenv from "dotenv"
import mongoose from "mongoose"
dotenv.config()

const connectDB=async()=>{
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error("MONGODB_URI is not defined in environment variables");
        }
        if (!process.env.DB_NAME) {
            throw new Error("DB_NAME is not defined in environment variables");
        }
        
        const connectionInstance=await mongoose.connect(`${process.env.MONGODB_URI}/${process.env.DB_NAME}`);
        console.log(`✅ Connected to MongoDB: ${connectionInstance.connection.host}`);
        return connectionInstance;
    } catch (error) {
        console.error("❌ Database connection error:", error.message);
        throw error; // Re-throw to prevent server from starting without DB
    }
}

export default connectDB;