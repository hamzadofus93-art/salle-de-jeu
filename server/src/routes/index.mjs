import { Router } from "express";
import authRoutes from "./auth.routes.mjs";
import accountsRoutes from "./accounts.routes.mjs";
import tablesRoutes from "./tables.routes.mjs";
import matchesRoutes from "./matches.routes.mjs";
import dashboardRoutes from "./dashboard.routes.mjs";

const router = Router();

router.get("/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "phoenix-snooker-server",
  });
});

router.use("/auth", authRoutes);
router.use("/accounts", accountsRoutes);
router.use("/tables", tablesRoutes);
router.use("/matches", matchesRoutes);
router.use("/dashboard", dashboardRoutes);

export default router;
