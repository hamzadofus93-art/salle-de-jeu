import { prisma } from "../db/prisma.mjs";
import { badRequest, forbidden, notFound } from "../utils/http-error.mjs";
import { namesMatch, sanitizeText } from "../utils/normalize.mjs";
import { toPublicTable } from "../utils/serializers.mjs";
import { assertCanManageTable, managedTableWhere } from "./table-access.service.mjs";

const tableInclude = {
  matches: {
    where: { status: "ACTIVE" },
    orderBy: { startedAt: "desc" },
  },
  reservations: {
    where: { status: "UPCOMING" },
    include: { user: true },
    orderBy: { endAt: "asc" },
  },
  waitingEntries: {
    orderBy: { position: "asc" },
  },
};

export async function listTables(actor = null) {
  const tables = await prisma.gameTable.findMany({
    where: managedTableWhere(actor),
    include: tableInclude,
    orderBy: { name: "asc" },
  });

  return [...tables]
    .sort((left, right) =>
      left.name.localeCompare(right.name, "fr", {
        numeric: true,
        sensitivity: "base",
      }),
    )
    .map(toPublicTable);
}

export async function createTable(payload, actor = null) {
  if (actor?.role !== "SUDO") {
    throw forbidden("Seul le super admin peut ajouter une table.");
  }

  const discipline = normalizeTableDiscipline(payload?.discipline);
  const tableNumber = normalizeTableNumber(payload?.tableNumber);

  if (!discipline) {
    throw badRequest("Choisis Pool ou Snooker.");
  }

  if (!tableNumber) {
    throw badRequest("Indique un numero de table valide.");
  }

  const tableData = buildTableData(discipline, tableNumber);
  const existingTable = await prisma.gameTable.findUnique({
    where: { id: tableData.id },
  });

  if (existingTable) {
    throw badRequest("Cette table existe deja.");
  }

  await prisma.gameTable.create({
    data: tableData,
  });

  return getTableById(tableData.id);
}

export async function deleteTable(tableId, actor = null) {
  if (actor?.role !== "SUDO") {
    throw forbidden("Seul le super admin peut supprimer une table.");
  }

  const normalizedTableId = sanitizeText(tableId, 50);

  if (!normalizedTableId) {
    throw badRequest("Choisis la table à supprimer.");
  }

  const table = await prisma.gameTable.findUnique({
    where: { id: normalizedTableId },
    include: {
      matches: {
        select: { id: true, status: true },
      },
      waitingEntries: {
        select: { id: true },
      },
      reservations: {
        select: { id: true, status: true },
      },
    },
  });

  if (!table) {
    throw notFound("Table introuvable.");
  }

  if (table.status === "OCCUPIED" || table.matches.some((match) => match.status === "ACTIVE")) {
    throw badRequest("Impossible de supprimer une table avec une partie en cours.");
  }

  if (table.waitingEntries.length) {
    throw badRequest("Vide la file d'attente avant de supprimer cette table.");
  }

  if (table.matches.length || table.reservations.length) {
    throw badRequest("Impossible de supprimer une table qui possède déjà un historique.");
  }

  await prisma.gameTable.delete({
    where: { id: table.id },
  });

  return { deletedTableId: table.id };
}

export async function addWaitingPlayer(tableId, payload, actor = null) {
  if (isStaff(actor)) {
    await assertCanManageTable(actor, tableId);
  }

  const table = await prisma.gameTable.findUnique({
    where: { id: tableId },
    include: tableInclude,
  });

  if (!table) {
    throw notFound("Table introuvable.");
  }

  const playerName = resolveWaitingPlayerName(actor, payload);

  if (!playerName) {
    throw badRequest("Indique le joueur a ajouter.");
  }

  if (
    table.waitingEntries.some((entry) => namesMatch(entry.playerName, playerName))
  ) {
    throw badRequest("Ce joueur est deja dans la liste d'attente de cette table.");
  }

  const activeMatch = table.matches[0] || null;

  if (
    activeMatch
    && [activeMatch.playerOne, activeMatch.playerTwo].some((player) =>
      namesMatch(player, playerName),
    )
  ) {
    throw badRequest("Ce joueur participe deja a la reservation en cours sur cette table.");
  }

  await prisma.waitingQueueEntry.create({
    data: {
      tableId: table.id,
      playerName,
      position: table.waitingEntries.length + 1,
    },
  });

  return getTableById(table.id);
}

export async function removeWaitingPlayer(tableId, entryId, actor = null) {
  if (isStaff(actor)) {
    await assertCanManageTable(actor, tableId);
  }

  const table = await prisma.gameTable.findUnique({
    where: { id: tableId },
    include: tableInclude,
  });

  if (!table) {
    throw notFound("Table introuvable.");
  }

  const entry = table.waitingEntries.find((currentEntry) => currentEntry.id === entryId);

  if (!entry) {
    throw notFound("Joueur en attente introuvable.");
  }

  if (!canManageWaitingEntry(actor, entry.playerName)) {
    throw forbidden("Tu peux retirer uniquement ton propre nom de la file d'attente.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.waitingQueueEntry.delete({
      where: { id: entryId },
    });

    const remainingEntries = await tx.waitingQueueEntry.findMany({
      where: { tableId },
      orderBy: { position: "asc" },
    });

    for (const [index, waitingEntry] of remainingEntries.entries()) {
      await tx.waitingQueueEntry.update({
        where: { id: waitingEntry.id },
        data: {
          position: index + 1,
        },
      });
    }
  });

  return getTableById(table.id);
}

export async function resetAllWaitingLists(actor = null) {
  const tableWhere = managedTableWhere(actor);
  const where = Object.keys(tableWhere).length
    ? { table: tableWhere }
    : {};
  const clearedCount = await prisma.waitingQueueEntry.count({ where });

  if (!clearedCount) {
    return { clearedCount: 0 };
  }

  await prisma.waitingQueueEntry.deleteMany({ where });

  return { clearedCount };
}

export async function getTableById(tableId) {
  const table = await prisma.gameTable.findUnique({
    where: { id: tableId },
    include: tableInclude,
  });

  if (!table) {
    throw notFound("Table introuvable.");
  }

  return toPublicTable(table);
}

function resolveWaitingPlayerName(actor, payload) {
  if (isStaff(actor)) {
    return sanitizeText(payload?.playerName, 30);
  }

  return sanitizeText(actor?.displayName || actor?.username, 30);
}

function canManageWaitingEntry(actor, playerName) {
  if (isStaff(actor)) {
    return true;
  }

  return getActorQueueNames(actor).some((name) => namesMatch(name, playerName));
}

function getActorQueueNames(actor) {
  return [actor?.displayName, actor?.username].filter(Boolean);
}

function isStaff(actor) {
  return ["ADMIN", "SUDO"].includes(actor?.role || "");
}

function normalizeTableDiscipline(value) {
  const normalizedValue = sanitizeText(value, 20).toLowerCase();

  if (normalizedValue === "pool" || normalizedValue === "pool anglais") {
    return "pool";
  }

  if (normalizedValue === "snooker") {
    return "snooker";
  }

  return "";
}

function normalizeTableNumber(value) {
  const parsedValue = Number.parseInt(String(value || ""), 10);

  if (!Number.isInteger(parsedValue) || parsedValue < 1 || parsedValue > 999) {
    return 0;
  }

  return parsedValue;
}

function buildTableData(discipline, tableNumber) {
  if (discipline === "pool") {
    return {
      id: `pool-${tableNumber}`,
      name: `Phoenix Pool ${tableNumber}`,
      discipline: "Pool anglais",
      shortDiscipline: "Pool",
      status: "FREE",
    };
  }

  return {
    id: `snooker-${tableNumber}`,
    name: `Phoenix Snooker ${tableNumber}`,
    discipline: "Snooker",
    shortDiscipline: "Snooker",
    status: "FREE",
  };
}
