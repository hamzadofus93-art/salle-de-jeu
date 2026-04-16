import { Router } from "express";
import {
  clearHistoryController,
  dashboardStateController,
  historyController,
  leaderboardController,
} from "../controllers/dashboard.controller.mjs";
import { requireAuth, requireStaff, requireSudo } from "../middleware/auth.mjs";
import { asyncHandler } from "../utils/async-handler.mjs";

const router = Router();

router.use(requireAuth, requireStaff);
router.get("/state", asyncHandler(dashboardStateController));
router.get("/leaderboard", asyncHandler(leaderboardController));
router.get("/history", asyncHandler(historyController));
router.delete("/history", requireSudo, asyncHandler(clearHistoryController));

export default router;
