import cors from "cors";
import express from "express";
import morgan from "morgan";
import { env } from "./config/env.mjs";
import {
  errorHandler,
  notFoundHandler,
} from "./middleware/error-handler.mjs";
import apiRoutes from "./routes/index.mjs";

export function createVercelApiApp() {
  const app = express();
  const corsOrigin = env.corsOrigin === "*" ? true : env.corsOrigin.split(",");

  app.use(
    cors({
      origin: corsOrigin,
    }),
  );
  app.use(express.json());
  app.use(morgan("dev"));

  app.use("/api", apiRoutes);
  app.use("/", apiRoutes);

  app.get("/api", (_request, response) => {
    response.status(200).json({
      message: "Phoenix Snooker API",
      frontendServedByExpress: false,
      runtime: "vercel",
    });
  });

  app.get("/", (_request, response) => {
    response.status(200).json({
      message: "Phoenix Snooker API",
      frontendServedByExpress: false,
      runtime: "vercel",
    });
  });

  app.use("/api", notFoundHandler);
  app.use("/", notFoundHandler);
  app.use(errorHandler);

  return app;
}
