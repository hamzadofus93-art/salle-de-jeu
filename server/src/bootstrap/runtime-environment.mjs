import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);
const vercelTemplateDatabasePath = path.resolve(
  currentDirectory,
  "../../prisma/vercel-template.db",
);
const defaultVercelDatabasePath = "/tmp/phoenix-snooker.db";

export async function prepareRuntimeEnvironment() {
  if (!process.env.VERCEL) {
    return;
  }

  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = `file:${defaultVercelDatabasePath}`;
  }

  const sqliteDatabasePath = resolveSqliteDatabasePath(process.env.DATABASE_URL);

  if (!sqliteDatabasePath) {
    return;
  }

  mkdirSync(path.dirname(sqliteDatabasePath), { recursive: true });

  if (!existsSync(sqliteDatabasePath) && existsSync(vercelTemplateDatabasePath)) {
    copyFileSync(vercelTemplateDatabasePath, sqliteDatabasePath);
  }
}

function resolveSqliteDatabasePath(databaseUrl) {
  if (!databaseUrl || !databaseUrl.startsWith("file:")) {
    return "";
  }

  const rawPath = databaseUrl.slice("file:".length);

  if (!rawPath) {
    return "";
  }

  return path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(currentDirectory, "../../prisma", rawPath);
}
