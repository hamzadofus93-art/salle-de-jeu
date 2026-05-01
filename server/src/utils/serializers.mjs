export function toPublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role.toLowerCase(),
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function toPublicTable(table) {
  const activeMatch = table.matches?.find((match) => match.status === "ACTIVE") || null;
  const waitingEntries = [...(table.waitingEntries || [])].sort(
    (left, right) => left.position - right.position,
  );

  return {
    id: table.id,
    name: table.name,
    discipline: table.discipline,
    shortDiscipline: table.shortDiscipline,
    status: activeMatch ? "occupied" : "free",
    sessionsCompleted: table.sessionsCompleted,
    lastWinner: table.lastWinnerName,
    lastEndedAt: table.lastEndedAt,
    currentMatch: activeMatch ? toPublicMatch(activeMatch) : null,
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
  return {
    id: reservation.id,
    tableId: reservation.tableId,
    tableName: reservation.table?.name || null,
    discipline: reservation.table?.discipline || null,
    startAt: reservation.startAt,
    endAt: reservation.endAt,
    durationMinutes: reservation.durationMinutes,
    note: reservation.note,
    status: reservation.status.toLowerCase(),
    createdAt: reservation.createdAt,
    updatedAt: reservation.updatedAt,
    createdBy: reservation.user ? toPublicUser(reservation.user) : null,
  };
}
