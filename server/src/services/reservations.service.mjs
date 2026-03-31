import { prisma } from "../db/prisma.mjs";
import { badRequest, forbidden, notFound } from "../utils/http-error.mjs";
import { toPublicReservation } from "../utils/serializers.mjs";

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
    ownerUserId: actor.id,
  });

  const reservation = await prisma.reservation.create({
    data: {
      tableId: reservationInput.table.id,
      userId: actor.id,
      startAt: reservationInput.startAt,
      endAt: reservationInput.endAt,
      durationMinutes: reservationInput.durationMinutes,
      note: reservationInput.note,
      status: "UPCOMING",
    },
    include: reservationInclude,
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
    ownerUserId: reservation.userId,
    reservationIdToIgnore: reservation.id,
  });

  const updatedReservation = await prisma.reservation.update({
    where: { id: reservation.id },
    data: {
      tableId: reservationInput.table.id,
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

  const canceledReservation = await prisma.reservation.update({
    where: { id: reservationId },
    data: {
      status: "CANCELED",
    },
    include: reservationInclude,
  });

  return toPublicReservation(canceledReservation);
}

async function validateReservationInput({
  actor,
  payload,
  ownerUserId,
  reservationIdToIgnore = null,
}) {
  const tableId = String(payload?.tableId || "").trim();
  const note = sanitizeOptionalText(payload?.note, 120);
  const startAt = parseFutureDate(payload?.startAt);
  const durationMinutes = parseDuration(payload?.durationMinutes);
  const endAt = new Date(startAt.getTime() + durationMinutes * 60000);

  const table = await prisma.gameTable.findUnique({
    where: { id: tableId },
  });

  if (!table) {
    throw notFound("Table introuvable.");
  }

  const userExistingVisibleReservation = await prisma.reservation.findFirst({
    where: {
      id: reservationIdToIgnore ? { not: reservationIdToIgnore } : undefined,
      tableId,
      userId: ownerUserId,
      status: "UPCOMING",
      endAt: {
        gte: new Date(),
      },
    },
    include: reservationInclude,
  });

  if (userExistingVisibleReservation) {
    throw badRequest(
      "Tu apparais deja sur cette table dans la liste des reservations visibles. Annule ou attends la fin de cette reservation pour en refaire une.",
    );
  }

  const conflictingReservation = await prisma.reservation.findFirst({
    where: {
      id: reservationIdToIgnore ? { not: reservationIdToIgnore } : undefined,
      tableId,
      status: "UPCOMING",
      startAt: {
        lt: endAt,
      },
      endAt: {
        gt: startAt,
      },
    },
    include: reservationInclude,
  });

  if (conflictingReservation) {
    throw badRequest("Cette table est deja reservee sur le creneau demande.");
  }

  return {
    actor,
    table,
    note,
    startAt,
    endAt,
    durationMinutes,
  };
}

function parseFutureDate(value) {
  const date = new Date(String(value || ""));

  if (Number.isNaN(date.getTime())) {
    throw badRequest("Choisis une date de reservation valide.");
  }

  if (date.getTime() <= Date.now()) {
    throw badRequest("La reservation doit etre planifiee dans le futur.");
  }

  return date;
}

function parseDuration(value) {
  const durationMinutes = Number.parseInt(String(value || ""), 10);

  if (!Number.isFinite(durationMinutes) || durationMinutes < 30 || durationMinutes > 240) {
    throw badRequest("La duree doit etre comprise entre 30 et 240 minutes.");
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
