import { Router } from "express";
import { login, signup } from "../controllers/player.controllers.js";

const router=Router();

router.route("/login",login)
router.route("signup",signup);

export default router;