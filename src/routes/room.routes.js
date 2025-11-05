import { Router } from "express";
import { createRoom, joinRoom, getRoom } from "../controllers/room.controllers.js";
import auth from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/create", auth, createRoom);
router.post("/join", auth, joinRoom);
router.get("/:roomId", getRoom);

export default router;

