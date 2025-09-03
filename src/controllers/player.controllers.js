import { User } from "../models/users.model";
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError";

export const signup=async(req,res)=>{
    const {username,password}=req.body;
    const userExists=await User.findOne({username});
    if(
        [username,password].some((field)=>
            field?.trim()==="")
    )
    {
        throw new ApiError(400,"All fields are required!")
    }

    if(userExists){
        return res.status(400).json({message:"User already exists"});
    }
    // const hashedPassword=await bcrypt.hash(password,10);
    // const token=jwt.sign({username},process.env.JWT_SECRET,{expiresIn:"1h"});

    try {
        const userCreated=await User.create({
            username,
            password
        });
    
        
        res.status(201).json({message:"User created successfully",userCreated});
    } catch (error) {
        console.log(error);
        throw new ApiError(500,"Internal server error!");
    }
    

}

export const login=async(req,res)=>{
    const {username,password}=req.body;
    if(
        [username,password].some((field)=>
            field?.trim()==="")
    )

    {
        throw new ApiError(400,"All fields are required!")
    }
    const user = await User.findOne({ username });
if(!user) throw new ApiError(401, "Invalid credentials");

const isMatch = await bcrypt.compare(password, user.password);
if(!isMatch) throw new ApiError(401, "Invalid credentials");

    const token=jwt.sign({username},process.env.JWT_SECRET,{expiresIn:"1h"});
    
    res.status(200).json({message:"Login successful",token,userId:user._id});
}

export const getAllUsers=async(req,res)=>{
    try {
        const users=await User.find().select("-password -__v").lean();
        res.status(200).json({users});
    } catch (error) {
        console.log(error);
        throw new ApiError(500,"Internal server error!");
    }
}