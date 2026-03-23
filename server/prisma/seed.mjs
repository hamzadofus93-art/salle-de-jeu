import "dotenv/config";
import bcrypt from "bcryptjs";
import prismaPackage from "@prisma/client";
import { DEFAULT_TABLES } from "../src/config/default-tables.mjs";

const { PrismaClient, AccountRole, TableStatus } = prismaPackage;

const prisma = new PrismaClient();

async function main() {
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

  console.log("Seed termine : compte sudo et tables Phoenix crees.");
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

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
