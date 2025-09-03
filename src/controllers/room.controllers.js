import Room from "../models/room.model.js";
import Player from "../models/player.model.js";

export const createRoom=async(req,res)=>{
    const {playerName}=req.body;
    const player=await Player.findOne({playerName});
    if(!playerName){
        return res.status(400).json({message:"Player name is required"});
    }
    try {
        const newRoom=await Room.create({
            players:[],
            owner:player._id,
            roomId:Math.random().toString(36).substring(2,7).toUpperCase()
        });


        return res.status(201).json({roomId:newRoom.roomId,newRoom});
    } catch (error) {
        return res.status(500).json({message:"Internal server error"});
    }

}

export const joinRoom=async(req,res)=>{
    const {playerName,roomId}=req.body;
    const player=await Player.findOne({username:playerName});
    if(!playerName || !roomId){
        return res.status(400).json({message:"Player and Room ID are both required"});
    }
    try {
        const room=await Room.findOne({roomId}); 
        if(!room){
            return res.status(404).json({message:"Room not found"});
        }
        
        room.players.push(player._id);
        await room.save();
        return res.status(200).json({roomId:room.roomId,playerId:player._id});
    } catch (error) {
        return res.status(500).json({message:"Internal server error"});
    }
}

export const getRoom=async(req,res)=>{
    const {roomId}=req.params;
    try {
        const room=await Room.findOne({roomId});

        if(!room){
            return res.status(404).json({message:"Room not found"});
        }
        return res.status(200).json({room});
    } catch (error) {
        return res.status(500).json({message:"Internal server error"});
    }
}