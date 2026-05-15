import { Router } from "express";
import authRoutes from "./auth.routes.mjs";
import accountsRoutes from "./accounts.routes.mjs";
import tablesRoutes from "./tables.routes.mjs";
import matchesRoutes from "./matches.routes.mjs";
import dashboardRoutes from "./dashboard.routes.mjs";
import reservationsRoutes from "./reservations.routes.mjs";
import { asyncHandler } from "../utils/async-handler.mjs";
import { autoCloseExpiredPoolMatches } from "../services/matches.service.mjs";
import { autoCompleteExpiredPoolReservations } from "../services/reservations.service.mjs";

const router = Router();

router.get("/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "phoenix-snooker-server",
  });
});
router.use(
  asyncHandler(async (_request, _response, next) => {
    await Promise.all([
      autoCloseExpiredPoolMatches(),
      autoCompleteExpiredPoolReservations(),
    ]);
    next();
  }),
);

router.use("/auth", authRoutes);
router.use("/accounts", accountsRoutes);
router.use("/tables", tablesRoutes);
router.use("/matches", matchesRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/reservations", reservationsRoutes);

export default router;
