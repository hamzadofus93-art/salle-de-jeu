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
    status: table.status.toLowerCase(),
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
    durationMinutes: match.durationMinutes,
    status: match.status.toLowerCase(),
  };
}
