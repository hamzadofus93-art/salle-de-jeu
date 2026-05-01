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
      },
      create: {
        ...table,
        status: TableStatus.FREE,
      },
    });
  }

  await reconcileTableStatuses();

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

async function reconcileTableStatuses() {
  const [tables, activeMatches] = await Promise.all([
    prisma.gameTable.findMany({
      select: {
        id: true,
        status: true,
      },
    }),
    prisma.match.findMany({
      where: { status: "ACTIVE" },
      select: { tableId: true },
    }),
  ]);

  const activeTableIds = new Set(activeMatches.map((match) => match.tableId));

  await Promise.all(
    tables.map((table) => {
      const expectedStatus = activeTableIds.has(table.id)
        ? TableStatus.OCCUPIED
        : TableStatus.FREE;

      if (table.status === expectedStatus) {
        return Promise.resolve();
      }

      return prisma.gameTable.update({
        where: { id: table.id },
        data: { status: expectedStatus },
      });
    }),
  );
}
