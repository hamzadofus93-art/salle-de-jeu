import { Router } from "express";
import {
  addWaitingPlayerController,
  listTablesController,
  removeWaitingPlayerController,
} from "../controllers/tables.controller.mjs";
import { requireAuth } from "../middleware/auth.mjs";
import { asyncHandler } from "../utils/async-handler.mjs";

const router = Router();

router.use(requireAuth);
router.get("/", asyncHandler(listTablesController));
router.post(
  "/:tableId/waiting-list",
  asyncHandler(addWaitingPlayerController),
);
router.delete(
  "/:tableId/waiting-list/:entryId",
  asyncHandler(removeWaitingPlayerController),
);

export default router;
