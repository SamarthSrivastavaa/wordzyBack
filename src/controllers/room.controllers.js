import Room from "../models/room.model.js";
import Player from "../models/player.model.js";

export const createRoom = async (req, res) => {
    try {
        const userId = req.user.userId;
        
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const player = await Player.findById(userId);
        if (!player) {
            return res.status(404).json({ message: "Player not found" });
        }

        // Generate unique room ID
        let roomId;
        let isUnique = false;
        while (!isUnique) {
            roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
            const existingRoom = await Room.findOne({ roomId });
            if (!existingRoom) {
                isUnique = true;
            }
        }

        const newRoom = await Room.create({
            players: [userId],
            owner: userId,
            roomId: roomId
        });

        const populatedRoom = await Room.findById(newRoom._id)
            .populate('players', 'username gamesPlayed gamesWon winRate')
            .populate('owner', 'username');

        return res.status(201).json({
            roomId: newRoom.roomId,
            room: populatedRoom,
            message: "Room created successfully"
        });
    } catch (error) {
        console.error("Create room error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
}

export const joinRoom = async (req, res) => {
    try {
        const { roomId } = req.body;
        const userId = req.user.userId;

        if (!roomId) {
            return res.status(400).json({ message: "Room ID is required" });
        }

        const player = await Player.findById(userId);
        if (!player) {
            return res.status(404).json({ message: "Player not found" });
        }

        const room = await Room.findOne({ roomId }).populate('players');
        if (!room) {
            return res.status(404).json({ message: "Room not found" });
        }

        // Check if room is full (max 7 players)
        if (room.players.length >= 7) {
            return res.status(400).json({ message: "Room is full (maximum 7 players)" });
        }

        // Check if player is already in room
        const playerExists = room.players.some(p => 
            p._id.toString() === userId.toString()
        );
        
        if (!playerExists) {
            room.players.push(userId);
            await room.save();
        }

        const populatedRoom = await Room.findById(room._id)
            .populate('players', 'username gamesPlayed gamesWon winRate')
            .populate('owner', 'username');

        return res.status(200).json({
            roomId: room.roomId,
            playerId: userId,
            room: populatedRoom,
            message: "Successfully joined room"
        });
    } catch (error) {
        console.error("Join room error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
}

export const getRoom = async (req, res) => {
    try {
        const { roomId } = req.params;
        
        const room = await Room.findOne({ roomId })
            .populate('players', 'username gamesPlayed gamesWon winRate')
            .populate('owner', 'username');

        if (!room) {
            return res.status(404).json({ message: "Room not found" });
        }
        
        return res.status(200).json({ room });
    } catch (error) {
        console.error("Get room error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
}