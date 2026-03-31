import { Router } from "express";
import {
  cancelReservationController,
  createReservationController,
  listReservationsController,
  updateReservationController,
} from "../controllers/reservations.controller.mjs";
import { requireAuth } from "../middleware/auth.mjs";
import { asyncHandler } from "../utils/async-handler.mjs";

const router = Router();

router.use(requireAuth);
router.get("/", asyncHandler(listReservationsController));
router.post("/", asyncHandler(createReservationController));
router.patch("/:reservationId", asyncHandler(updateReservationController));
router.delete("/:reservationId", asyncHandler(cancelReservationController));

export default router;
