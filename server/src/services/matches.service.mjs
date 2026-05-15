import { prisma } from "../db/prisma.mjs";
import { badRequest, notFound } from "../utils/http-error.mjs";
import { namesMatch, sanitizeText } from "../utils/normalize.mjs";
import { toPublicMatch, toPublicTable } from "../utils/serializers.mjs";
import { assertCanManageTable } from "./table-access.service.mjs";

const POOL_AUTO_CLOSE_GRACE_MINUTES = 5;
const AUTO_CLOSE_NOTE = "Cloture automatique apres 5 min de depassement.";

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

export async function startMatch(payload, actor = null) {
  const tableId = sanitizeText(payload?.tableId, 50);
  const playerOne = sanitizeText(payload?.playerOne, 30);
  const playerTwo = sanitizeText(payload?.playerTwo, 30);
  const note = sanitizeText(payload?.note, 120) || null;

  if (!tableId || !playerOne || !playerTwo) {
    throw badRequest("Table et joueurs sont obligatoires.");
  }

  await assertCanManageTable(actor, tableId);

  if (namesMatch(playerOne, playerTwo)) {
    throw badRequest("Merci d'indiquer deux joueurs differents.");
  }

  const table = await prisma.gameTable.findUnique({
    where: { id: tableId },
    include: tableInclude,
  });

  if (!table) {
    throw notFound("Table introuvable.");
  }

  if (table.status === "OCCUPIED" || table.matches.length > 0) {
    throw badRequest("Cette table n'est plus disponible.");
  }

  if (table.discipline === "Pool anglais") {
    throw badRequest("Pour une table Pool, cree une reservation par duree au lieu de demarrer une partie.");
  }

  const format = getMatchFormat(table, payload?.durationMinutes);

  const result = await prisma.$transaction(async (tx) => {
    const waitingEntriesToRemove = table.waitingEntries.filter((entry) =>
      namesMatch(entry.playerName, playerOne) || namesMatch(entry.playerName, playerTwo),
    );

    if (waitingEntriesToRemove.length > 0) {
      await tx.waitingQueueEntry.deleteMany({
        where: {
          id: {
            in: waitingEntriesToRemove.map((entry) => entry.id),
          },
        },
      });
    }

    await tx.gameTable.update({
      where: { id: table.id },
      data: {
        status: "OCCUPIED",
      },
    });

    const match = await tx.match.create({
      data: {
        tableId: table.id,
        discipline: table.discipline,
        format,
        note,
        playerOne,
        playerTwo,
        status: "ACTIVE",
      },
    });

    const updatedTable = await tx.gameTable.findUnique({
      where: { id: table.id },
      include: tableInclude,
    });

    return {
      match,
      table: updatedTable,
    };
  });

  return {
    match: toPublicMatch(result.match),
    table: toPublicTable(result.table),
  };
}

export async function finishMatch(matchId, payload, actor = null) {
  const winner = sanitizeText(payload?.winner, 30);
  const finishNote = sanitizeText(payload?.note, 120) || null;
  const replay = payload?.replay === true;

  if (!winner) {
    throw badRequest("Choisis le vainqueur de la partie.");
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      table: true,
    },
  });

  if (!match || match.status !== "ACTIVE") {
    throw notFound("Match actif introuvable.");
  }

  await assertCanManageTable(actor, match.tableId);

  if (![match.playerOne, match.playerTwo].some((player) => namesMatch(player, winner))) {
    throw badRequest("Le vainqueur doit etre un des deux joueurs du match.");
  }

  const endedAt = new Date();
  const durationMinutes = Math.max(
    1,
    Math.round((endedAt.getTime() - match.startedAt.getTime()) / 60000),
  );

  const result = await prisma.$transaction(async (tx) => {
    const updatedMatch = await tx.match.update({
      where: { id: match.id },
      data: {
        status: "FINISHED",
        winnerName: winner,
        note: finishNote || match.note,
        endedAt,
        durationMinutes,
      },
    });

    if (replay) {
      const waitingCount = await tx.waitingQueueEntry.count({
        where: { tableId: match.tableId },
      });

      if (waitingCount > 0) {
        throw badRequest(
          "Impossible de rejouer: des joueurs attendent deja sur cette table.",
        );
      }
    }

    await tx.gameTable.update({
      where: { id: match.tableId },
      data: {
        status: replay ? "OCCUPIED" : "FREE",
        sessionsCompleted: {
          increment: 1,
        },
        lastWinnerName: winner,
        lastEndedAt: endedAt,
      },
    });

    if (replay) {
      await tx.match.create({
        data: {
          tableId: match.tableId,
          discipline: match.discipline,
          format: match.format,
          note: null,
          playerOne: match.playerOne,
          playerTwo: match.playerTwo,
          status: "ACTIVE",
        },
      });
    }

    const updatedTable = await tx.gameTable.findUnique({
      where: { id: match.tableId },
      include: tableInclude,
    });

    return {
      match: updatedMatch,
      table: updatedTable,
    };
  });

  return {
    match: toPublicMatch(result.match),
    table: toPublicTable(result.table),
  };
}

export async function autoCloseExpiredPoolMatches(referenceDate = new Date()) {
  const now = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);

  if (Number.isNaN(now.getTime())) {
    return { closedCount: 0 };
  }

  const activePoolMatches = await prisma.match.findMany({
    where: {
      status: "ACTIVE",
      discipline: "Pool anglais",
    },
    orderBy: { startedAt: "asc" },
  });

  let closedCount = 0;

  for (const match of activePoolMatches) {
    const plannedDurationMinutes = getPlannedPoolDurationMinutes(match);

    if (!plannedDurationMinutes) {
      continue;
    }

    const autoCloseAt = new Date(
      match.startedAt.getTime()
        + (plannedDurationMinutes + POOL_AUTO_CLOSE_GRACE_MINUTES) * 60_000,
    );

    if (autoCloseAt.getTime() > now.getTime()) {
      continue;
    }

    const wasClosed = await autoCloseMatchIfStillActive(match, now);

    if (wasClosed) {
      closedCount += 1;
    }
  }

  return { closedCount };
}

function getMatchFormat(table, durationMinutesValue) {
  if (table.discipline !== "Pool anglais") {
    return null;
  }

  const durationMinutes = Number.parseInt(String(durationMinutesValue || ""), 10);

  if (!Number.isFinite(durationMinutes) || durationMinutes < 15) {
    throw badRequest("Indique une duree valide pour la reservation pool.");
  }

  return `${durationMinutes} min`;
}

function getPlannedPoolDurationMinutes(match) {
  const durationFromField = Number.parseInt(String(match?.durationMinutes || ""), 10);

  if (Number.isFinite(durationFromField) && durationFromField >= 15) {
    return durationFromField;
  }

  const formatMatch = String(match?.format || "").match(/(\d+)/);

  if (!formatMatch) {
    return 0;
  }

  const durationFromFormat = Number.parseInt(formatMatch[1], 10);

  return Number.isFinite(durationFromFormat) && durationFromFormat >= 15
    ? durationFromFormat
    : 0;
}

async function autoCloseMatchIfStillActive(match, endedAt) {
  const effectiveEndedAt = endedAt instanceof Date ? endedAt : new Date(endedAt);
  const durationMinutes = Math.max(
    1,
    Math.round((effectiveEndedAt.getTime() - match.startedAt.getTime()) / 60_000),
  );

  return prisma.$transaction(async (tx) => {
    const updateResult = await tx.match.updateMany({
      where: {
        id: match.id,
        status: "ACTIVE",
      },
      data: {
        status: "FINISHED",
        winnerName: null,
        note: buildAutoCloseNote(match.note),
        endedAt: effectiveEndedAt,
        durationMinutes,
      },
    });

    if (!updateResult.count) {
      return false;
    }

    await tx.gameTable.update({
      where: { id: match.tableId },
      data: {
        status: "FREE",
        sessionsCompleted: {
          increment: 1,
        },
        lastWinnerName: null,
        lastEndedAt: effectiveEndedAt,
      },
    });

    return true;
  });
}

function buildAutoCloseNote(existingNote) {
  const normalizedNote = sanitizeText(existingNote, 120);

  if (!normalizedNote) {
    return AUTO_CLOSE_NOTE;
  }

  if (normalizedNote.includes(AUTO_CLOSE_NOTE)) {
    return normalizedNote;
  }

  return `${normalizedNote} | ${AUTO_CLOSE_NOTE}`;
}
