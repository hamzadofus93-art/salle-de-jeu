import bcrypt from "bcryptjs";
import prismaPackage from "@prisma/client";
import { env } from "../config/env.mjs";
import { prisma } from "../db/prisma.mjs";
import { DEFAULT_TABLES } from "../config/default-tables.mjs";

const { AccountRole, TableStatus } = prismaPackage;

let runtimeSeedPromise = null;

export async function ensureRuntimeSeed() {
  if (!runtimeSeedPromise) {
    runtimeSeedPromise = seedRuntimeData().catch((error) => {
      runtimeSeedPromise = null;
      throw error;
    });
  }

  await runtimeSeedPromise;
}

async function seedRuntimeData() {
  const username = sanitizeUsername(
    process.env.SEED_SUDO_USERNAME || "admin",
  );
  const password = String(process.env.SEED_SUDO_PASSWORD || "phoenix123").trim();
  const displayName = sanitizeText(
    process.env.SEED_SUDO_DISPLAY_NAME || "Super Admin Phoenix",
  );
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { username },
    update: {
      displayName,
      role: AccountRole.SUDO,
      isActive: true,
      passwordHash,
    },
    create: {
      username,
      displayName,
      role: AccountRole.SUDO,
      isActive: true,
      passwordHash,
    },
  });

  for (const table of DEFAULT_TABLES) {
    await prisma.gameTable.upsert({
      where: { id: table.id },
      update: {
        name: table.name,
        discipline: table.discipline,
        shortDiscipline: table.shortDiscipline,
        status: TableStatus.FREE,
      },
      create: {
        ...table,
        status: TableStatus.FREE,
      },
    });
  }

  if (process.env.VERCEL) {
    console.log(
      `Runtime seed termine (${env.databaseUrl}) avec ${DEFAULT_TABLES.length} table(s).`,
    );
  }
}

function sanitizeUsername(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase()
    .slice(0, 30);
}

function sanitizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 40);
}
