import { Router } from "express";
import {
  loginController,
  logoutController,
  meController,
} from "../controllers/auth.controller.mjs";
import { asyncHandler } from "../utils/async-handler.mjs";
import { requireAuth } from "../middleware/auth.mjs";

const router = Router();

router.post("/login", asyncHandler(loginController));
router.post("/logout", requireAuth, asyncHandler(logoutController));
router.get("/me", requireAuth, asyncHandler(meController));

export default router;
