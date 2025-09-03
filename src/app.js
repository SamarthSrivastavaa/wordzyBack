// src/app.js
import express from "express";
import cors from "cors";
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

import roomRouter from "./routes/room.routes.js";
// REST API routes
// app.use('/api', routes);

// Optional: health check endpoint
app.get('/health', (req, res) => res.send({ status: 'ok' }));

export default app;