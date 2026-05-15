export function toPublicUser(user) {
  const managedTables = [...(user.managedTables || [])]
    .sort((left, right) =>
      left.name.localeCompare(right.name, "fr", {
        numeric: true,
        sensitivity: "base",
      }),
    )
    .map((table) => ({
      id: table.id,
      name: table.name,
      discipline: table.discipline,
    }));

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role.toLowerCase(),
    isActive: user.isActive,
    managedTableIds: managedTables.map((table) => table.id),
    managedTables,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function toPublicTable(table) {
  const activeMatch = table.matches?.find((match) => match.status === "ACTIVE") || null;
  const activeReservation =
    table.reservations?.find((reservation) => isReservationActive(reservation)) || null;
  const waitingEntries = [...(table.waitingEntries || [])].sort(
    (left, right) => left.position - right.position,
  );

  return {
    id: table.id,
    name: table.name,
    discipline: table.discipline,
    shortDiscipline: table.shortDiscipline,
    status: activeMatch || activeReservation ? "occupied" : "free",
    sessionsCompleted: table.sessionsCompleted,
    lastWinner: table.lastWinnerName,
    lastEndedAt: table.lastEndedAt,
    currentMatch: activeMatch ? toPublicMatch(activeMatch) : null,
    currentReservation: activeReservation ? toPublicReservation(activeReservation) : null,
    waitingPlayers: waitingEntries.map(toPublicWaitingEntry),
  };
}

export function toPublicWaitingEntry(entry) {
  return {
    id: entry.id,
    playerName: entry.playerName,
    position: entry.position,
    createdAt: entry.createdAt,
  };
}

export function toPublicMatch(match) {
  const normalizedDurationMinutes =
    match.durationMinutes || getMatchDurationFromFormat(match.format);

  return {
    id: match.id,
    tableId: match.tableId,
    discipline: match.discipline,
    format: match.format,
    note: match.note,
    playerOne: match.playerOne,
    playerTwo: match.playerTwo,
    players: [match.playerOne, match.playerTwo],
    winner: match.winnerName,
    startedAt: match.startedAt,
    endedAt: match.endedAt,
    durationMinutes: normalizedDurationMinutes,
    amountDueDh: calculateMatchAmountDue(match, normalizedDurationMinutes),
    status: match.status.toLowerCase(),
  };
}

function getMatchDurationFromFormat(format) {
  const match = String(format || "").match(/(\d+)/);

  if (!match) {
    return null;
  }

  const durationMinutes = Number(match[1]);
  return Number.isFinite(durationMinutes) ? durationMinutes : null;
}

export function toPublicReservation(reservation) {
  const amountDueDh = calculateReservationAmountDue(reservation);

  return {
    id: reservation.id,
    tableId: reservation.tableId,
    tableName: reservation.table?.name || null,
    discipline: reservation.table?.discipline || null,
    clientName: reservation.clientName || null,
    startAt: reservation.startAt,
    endAt: reservation.endAt,
    durationMinutes: reservation.durationMinutes,
    amountDueDh,
    note: reservation.note,
    status: reservation.status.toLowerCase(),
    createdAt: reservation.createdAt,
    updatedAt: reservation.updatedAt,
    createdBy: reservation.user ? toPublicUser(reservation.user) : null,
  };
}

function isReservationActive(reservation) {
  if (reservation.status !== "UPCOMING") {
    return false;
  }

  const now = Date.now();
  const startAt = new Date(reservation.startAt).getTime();
  const endAt = new Date(reservation.endAt).getTime();

  return Number.isFinite(startAt)
    && Number.isFinite(endAt)
    && startAt <= now
    && endAt > now;
}

function calculateReservationAmountDue(reservation) {
  if (reservation.table?.discipline !== "Pool anglais") {
    return null;
  }

  const durationMinutes = Number(reservation.durationMinutes);

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return null;
  }

  return roundMoney((durationMinutes * 40) / 60);
}

function calculateMatchAmountDue(match, durationMinutes) {
  if (match.discipline === "Snooker") {
    return 40;
  }

  if (match.discipline !== "Pool anglais") {
    return null;
  }

  const duration = Number(durationMinutes);

  if (!Number.isFinite(duration) || duration <= 0) {
    return null;
  }

  return roundMoney((duration * 40) / 60);
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}
