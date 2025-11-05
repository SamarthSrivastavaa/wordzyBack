import Player from "../models/player.model.js";
import jwt from "jsonwebtoken";

export const signup = async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Validate input
        if (!username || !password || username.trim() === "" || password.trim() === "") {
            return res.status(400).json({ message: "All fields are required!" });
        }

        // Check if player exists
        const playerExists = await Player.findOne({ username });
        if (playerExists) {
            return res.status(400).json({ message: "User already exists" });
        }

        // Create player (password will be hashed by pre-save hook)
        const userCreated = await Player.create({
            username,
            password
        });

        // Generate token
        const token = jwt.sign(
            { username: userCreated.username, userId: userCreated._id },
            process.env.JWT_SECRET,
            { expiresIn: "24h" }
        );

        res.status(201).json({
            message: "User created successfully",
            token,
            userId: userCreated._id,
            username: userCreated.username
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Internal server error!" });
    }
}

export const login = async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Validate input
        if (!username || !password || username.trim() === "" || password.trim() === "") {
            return res.status(400).json({ message: "All fields are required!" });
        }

        // Find player
        const player = await Player.findOne({ username });
        if (!player) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // Check password (using model method)
        const isMatch = await player.isPasswordCorrect(password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // Generate token
        const token = jwt.sign(
            { username: player.username, userId: player._id },
            process.env.JWT_SECRET,
            { expiresIn: "24h" }
        );

        res.status(200).json({
            message: "Login successful",
            token,
            userId: player._id,
            username: player.username
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Internal server error!" });
    }
}

export const getAllPlayers = async (req, res) => {
    try {
        const players = await Player.find().select("-password -__v").lean();
        res.status(200).json({ players });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Internal server error!" });
    }
}