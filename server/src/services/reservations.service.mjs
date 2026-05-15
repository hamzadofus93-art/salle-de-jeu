import { prisma } from "../db/prisma.mjs";
import { badRequest, forbidden, notFound } from "../utils/http-error.mjs";
import { toPublicReservation } from "../utils/serializers.mjs";
import { assertCanManageTable } from "./table-access.service.mjs";

const reservationInclude = {
  table: true,
  user: true,
};

export async function listReservations() {
  const now = new Date();
  const reservations = await prisma.reservation.findMany({
    where: {
      status: "UPCOMING",
      endAt: {
        gte: now,
      },
    },
    include: reservationInclude,
    orderBy: [
      { startAt: "asc" },
      { createdAt: "asc" },
    ],
  });

  return reservations.map(toPublicReservation);
}

export async function createReservation(actor, payload) {
  if (!actor?.id) {
    throw badRequest("Utilisateur introuvable pour cette reservation.");
  }

  const reservationInput = await validateReservationInput({
    actor,
    payload,
  });

  const reservation = await prisma.$transaction(async (tx) => {
    await tx.gameTable.update({
      where: { id: reservationInput.table.id },
      data: { status: "OCCUPIED" },
    });

    return tx.reservation.create({
      data: {
        tableId: reservationInput.table.id,
        userId: actor.id,
        clientName: reservationInput.clientName,
        startAt: reservationInput.startAt,
        endAt: reservationInput.endAt,
        durationMinutes: reservationInput.durationMinutes,
        note: reservationInput.note,
        status: "UPCOMING",
      },
      include: reservationInclude,
    });
  });

  return toPublicReservation(reservation);
}

export async function updateReservation(actor, reservationId, payload) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: reservationInclude,
  });

  if (!reservation) {
    throw notFound("Reservation introuvable.");
  }

  if (reservation.status !== "UPCOMING" || reservation.endAt < new Date()) {
    throw badRequest("Cette reservation n'est plus modifiable.");
  }

  const isOwner = reservation.userId === actor?.id;
  const isStaff = ["ADMIN", "SUDO"].includes(actor?.role || "");

  if (!isOwner && !isStaff) {
    throw forbidden("Tu ne peux modifier que tes propres reservations.");
  }

  const reservationInput = await validateReservationInput({
    actor,
    payload,
    reservationIdToIgnore: reservation.id,
  });

  const updatedReservation = await prisma.reservation.update({
    where: { id: reservation.id },
    data: {
      tableId: reservationInput.table.id,
      clientName: reservationInput.clientName,
      startAt: reservationInput.startAt,
      endAt: reservationInput.endAt,
      durationMinutes: reservationInput.durationMinutes,
      note: reservationInput.note,
    },
    include: reservationInclude,
  });

  return toPublicReservation(updatedReservation);
}

export async function cancelReservation(actor, reservationId) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: reservationInclude,
  });

  if (!reservation) {
    throw notFound("Reservation introuvable.");
  }

  if (reservation.status !== "UPCOMING" || reservation.endAt < new Date()) {
    throw badRequest("Cette reservation n'est plus annulable.");
  }

  const isOwner = reservation.userId === actor?.id;
  const isStaff = ["ADMIN", "SUDO"].includes(actor?.role || "");

  if (!isOwner && !isStaff) {
    throw forbidden("Tu ne peux annuler que tes propres reservations.");
  }

  const canceledReservation = await prisma.$transaction(async (tx) => {
    const updatedReservation = await tx.reservation.update({
      where: { id: reservationId },
      data: {
        status: "CANCELED",
      },
      include: reservationInclude,
    });

    await releaseTableIfIdle(tx, reservation.tableId, new Date(), { incrementSessions: false });

    return updatedReservation;
  });

  return toPublicReservation(canceledReservation);
}

export async function completeReservation(actor, reservationId) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: reservationInclude,
  });

  if (!reservation) {
    throw notFound("Reservation introuvable.");
  }

  if (reservation.status !== "UPCOMING") {
    throw badRequest("Cette reservation est deja cloturee.");
  }

  if (reservation.table?.discipline !== "Pool anglais") {
    throw badRequest("La cloture manuelle est reservee aux reservations Pool.");
  }

  await assertCanManageTable(actor, reservation.tableId);

  const endedAt = new Date();
  const completedReservation = await prisma.$transaction(async (tx) => {
    const updatedReservation = await tx.reservation.update({
      where: { id: reservation.id },
      data: {
        status: "COMPLETED",
        endAt: endedAt,
        durationMinutes: Math.max(
          1,
          Math.round((endedAt.getTime() - reservation.startAt.getTime()) / 60000),
        ),
      },
      include: reservationInclude,
    });

    await releaseTableIfIdle(tx, reservation.tableId, endedAt, {
      incrementSessions: true,
    });

    return updatedReservation;
  });

  return toPublicReservation(completedReservation);
}

export async function autoCompleteExpiredPoolReservations(referenceDate = new Date()) {
  const now = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);

  if (Number.isNaN(now.getTime())) {
    return { completedCount: 0 };
  }

  const expiredReservations = await prisma.reservation.findMany({
    where: {
      status: "UPCOMING",
      endAt: {
        lte: now,
      },
      table: {
        discipline: "Pool anglais",
      },
    },
    include: reservationInclude,
    orderBy: { endAt: "asc" },
  });

  let completedCount = 0;

  for (const reservation of expiredReservations) {
    const wasCompleted = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.reservation.updateMany({
        where: {
          id: reservation.id,
          status: "UPCOMING",
        },
        data: {
          status: "COMPLETED",
        },
      });

      if (!updateResult.count) {
        return false;
      }

      await releaseTableIfIdle(tx, reservation.tableId, now, {
        incrementSessions: true,
      });

      return true;
    });

    if (wasCompleted) {
      completedCount += 1;
    }
  }

  return { completedCount };
}

async function validateReservationInput({
  actor,
  payload,
  reservationIdToIgnore = null,
}) {
  const tableId = String(payload?.tableId || "").trim();
  const clientName = sanitizeOptionalText(payload?.clientName, 60);
  const note = sanitizeOptionalText(payload?.note, 120);
  const startAt = new Date();
  const durationMinutes = parseDuration(payload?.durationMinutes);
  const endAt = new Date(startAt.getTime() + durationMinutes * 60000);

  const table = await prisma.gameTable.findUnique({
    where: { id: tableId },
    include: {
      matches: {
        where: { status: "ACTIVE" },
        select: { id: true },
      },
      reservations: {
        where: {
          id: reservationIdToIgnore ? { not: reservationIdToIgnore } : undefined,
          status: "UPCOMING",
          startAt: {
            lt: endAt,
          },
          endAt: {
            gt: startAt,
          },
        },
        select: { id: true },
      },
    },
  });

  if (!table) {
    throw notFound("Table introuvable.");
  }

  await assertCanManageTable(actor, table.id);

  if (table.discipline !== "Pool anglais") {
    throw badRequest("La reservation par duree est reservee aux tables de Pool.");
  }

  if (!clientName) {
    throw badRequest("Indique le nom du client pour la reservation.");
  }

  if (table.matches.length > 0 || (table.status === "OCCUPIED" && !reservationIdToIgnore)) {
    throw badRequest("Cette table n'est plus disponible.");
  }

  if (table.reservations.length > 0) {
    throw badRequest("Cette table est deja reservee sur le creneau demande.");
  }

  return {
    table,
    clientName,
    note,
    startAt,
    endAt,
    durationMinutes,
  };
}

function parseDuration(value) {
  const durationMinutes = Number.parseInt(String(value || ""), 10);

  if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 480) {
    throw badRequest("La duree doit etre comprise entre 1 et 480 minutes.");
  }

  return durationMinutes;
}

function sanitizeOptionalText(value, maxLength = 120) {
  const sanitizedValue = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);

  return sanitizedValue || null;
}

async function releaseTableIfIdle(
  tx,
  tableId,
  referenceDate,
  { incrementSessions = false } = {},
) {
  const now = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const [activeMatchesCount, activeReservationsCount] = await Promise.all([
    tx.match.count({
      where: {
        tableId,
        status: "ACTIVE",
      },
    }),
    tx.reservation.count({
      where: {
        tableId,
        status: "UPCOMING",
        startAt: {
          lte: now,
        },
        endAt: {
          gt: now,
        },
      },
    }),
  ]);

  if (activeMatchesCount || activeReservationsCount) {
    return;
  }

  await tx.gameTable.update({
    where: { id: tableId },
    data: {
      status: "FREE",
      ...(incrementSessions
        ? {
            sessionsCompleted: {
              increment: 1,
            },
            lastWinnerName: null,
            lastEndedAt: now,
          }
        : {}),
    },
  });
}
