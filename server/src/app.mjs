import express from "express";
import cors from "cors";
import morgan from "morgan";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.mjs";
import apiRoutes from "./routes/index.mjs";
import {
  errorHandler,
  notFoundHandler,
} from "./middleware/error-handler.mjs";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);
const clientBrowserDistDirectory = path.resolve(
  currentDirectory,
  "../../client/dist/client/browser",
);
const clientIndexFilePath = path.join(clientBrowserDistDirectory, "index.html");

export function createApp() {
  const app = express();
  const hasClientBuild = existsSync(clientIndexFilePath);

  app.use(
    cors({
      origin: env.corsOrigin === "*" ? true : env.corsOrigin.split(","),
    }),
  );
  app.use(express.json());
  app.use(morgan("dev"));

  app.use("/api", apiRoutes);

  app.get("/api", (_request, response) => {
    response.status(200).json({
      message: "Phoenix Snooker API",
      frontendServedByExpress: hasClientBuild,
    });
  });

  app.use("/api", notFoundHandler);

  if (hasClientBuild) {
    app.use(
      express.static(clientBrowserDistDirectory, {
        index: false,
      }),
    );

    app.get("*", (request, response, next) => {
      if (request.path.startsWith("/api")) {
        next();
        return;
      }

      response.setHeader("Cache-Control", "no-store");
      response.sendFile(clientIndexFilePath);
    });
  } else {
    app.get("/", (_request, response) => {
      response.status(200).json({
        message: "Phoenix Snooker API",
        frontendServedByExpress: false,
        hint: "Lance `npm --prefix ../client run build` depuis le dossier server pour servir Angular depuis Express.",
      });
    });
  }

  app.use(errorHandler);

  return app;
}
