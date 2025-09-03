import { Router } from "express";

const router=Router();
import { createRoom, joinRoom, getRoom } from "../controllers/room.controllers.js";
router.route("/create",createRoom);
router.route("/join",joinRoom);
router.route("/:roomId",getRoom);


export default router;

