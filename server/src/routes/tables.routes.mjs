import { Router } from "express";
import {
  addWaitingPlayerController,
  createTableController,
  listTablesController,
  removeWaitingPlayerController,
  resetAllWaitingListsController,
} from "../controllers/tables.controller.mjs";
import { requireAuth, requireStaff } from "../middleware/auth.mjs";
import { asyncHandler } from "../utils/async-handler.mjs";

const router = Router();

router.get("/public", asyncHandler(listTablesController));
router.use(requireAuth);
router.get("/", asyncHandler(listTablesController));
router.post("/", requireStaff, asyncHandler(createTableController));
router.post(
  "/:tableId/waiting-list",
  asyncHandler(addWaitingPlayerController),
);
router.delete(
  "/waiting-list",
  requireStaff,
  asyncHandler(resetAllWaitingListsController),
);
router.delete(
  "/:tableId/waiting-list/:entryId",
  asyncHandler(removeWaitingPlayerController),
);

export default router;
