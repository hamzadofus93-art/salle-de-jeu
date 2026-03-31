import { Router } from "express";
import {
  finishMatchController,
  startMatchController,
} from "../controllers/matches.controller.mjs";
import { requireAuth, requireStaff } from "../middleware/auth.mjs";
import { asyncHandler } from "../utils/async-handler.mjs";

const router = Router();

router.use(requireAuth, requireStaff);
router.post("/start", asyncHandler(startMatchController));
router.post("/:matchId/finish", asyncHandler(finishMatchController));

export default router;
