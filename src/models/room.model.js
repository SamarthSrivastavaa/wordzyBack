import mongoose, {Schema} from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const roomSchema=new Schema({
    roomId:{
        type:String,
        unique:true
    },
    players:[{type:mongoose.Schema.Types.ObjectId,ref:"Player"}],
    owner:{type:mongoose.Schema.Types.ObjectId,ref:"Player"}
},
 { timestamps: true }
) 

const Room=mongoose.model("Room",roomSchema);
export default Room;