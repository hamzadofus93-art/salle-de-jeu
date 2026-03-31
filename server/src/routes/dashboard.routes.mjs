import { Router } from "express";
import {
  dashboardStateController,
  historyController,
  leaderboardController,
} from "../controllers/dashboard.controller.mjs";
import { requireAuth, requireStaff } from "../middleware/auth.mjs";
import { asyncHandler } from "../utils/async-handler.mjs";

const router = Router();

router.use(requireAuth, requireStaff);
router.get("/state", asyncHandler(dashboardStateController));
router.get("/leaderboard", asyncHandler(leaderboardController));
router.get("/history", asyncHandler(historyController));

export default router;
