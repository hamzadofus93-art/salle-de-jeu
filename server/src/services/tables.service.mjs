import { prisma } from "../db/prisma.mjs";
import { badRequest, forbidden, notFound } from "../utils/http-error.mjs";
import { namesMatch, sanitizeText } from "../utils/normalize.mjs";
import { toPublicTable } from "../utils/serializers.mjs";

const tableInclude = {
  matches: {
    where: { status: "ACTIVE" },
    orderBy: { startedAt: "desc" },
  },
  waitingEntries: {
    orderBy: { position: "asc" },
  },
};

export async function listTables() {
  const tables = await prisma.gameTable.findMany({
    include: tableInclude,
    orderBy: { name: "asc" },
  });

  return tables.map(toPublicTable);
}

export async function addWaitingPlayer(tableId, payload, actor = null) {
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
