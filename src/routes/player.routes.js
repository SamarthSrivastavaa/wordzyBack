import { Router } from "express";
import { login, signup, getAllPlayers } from "../controllers/player.controllers.js";
import auth from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.get("/all", auth, getAllPlayers);

export default router;