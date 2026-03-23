import { STORAGE_KEY, TABLE_DEFINITIONS } from "../shared/config.mjs";
import { normalizeWaitingPlayers } from "../shared/utils.mjs";

export function createDefaultState() {
  const tables = Object.fromEntries(
    TABLE_DEFINITIONS.map((table) => [
      table.id,
      {
        ...table,
        status: "free",
        currentMatch: null,
        waitingPlayers: [],
        sessionsCompleted: 0,
        lastWinner: null,
        lastEndedAt: null,
      },
    ]),
  );

  return {
    tables,
    history: [],
  };
}

export function loadState() {
  const fallback = createDefaultState();
  const rawValue = window.localStorage.getItem(STORAGE_KEY);

  if (!rawValue) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(rawValue);
    const nextTables = Object.fromEntries(
      TABLE_DEFINITIONS.map((table) => {
        const savedTable = parsed?.tables?.[table.id] || {};

        return [
          table.id,
          {
            ...table,
            status: savedTable.status === "occupied" ? "occupied" : "free",
            currentMatch: savedTable.currentMatch || null,
            waitingPlayers: normalizeWaitingPlayers(savedTable.waitingPlayers),
            sessionsCompleted: Number(savedTable.sessionsCompleted) || 0,
            lastWinner: savedTable.lastWinner || null,
            lastEndedAt: savedTable.lastEndedAt || null,
          },
        ];
      }),
    );

    return {
      tables: nextTables,
      history: Array.isArray(parsed?.history) ? parsed.history : [],
    };
  } catch {
    return fallback;
  }
}

export function saveState(state) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getTables(state) {
  return Object.values(state.tables);
}

export function getFreeTables(state) {
  return getTables(state).filter((table) => table.status === "free");
}

export function getActiveTables(state) {
  return getTables(state).filter((table) => table.status === "occupied");
}

export function getLeaderboardRows(state) {
  const scoreboard = new Map();

  state.history.forEach((match) => {
    const current = scoreboard.get(match.winner) || {
      name: match.winner,
      wins: 0,
      poolWins: 0,
      snookerWins: 0,
      lastWinAt: null,
    };

    current.wins += 1;

    if (match.discipline === "Pool anglais") {
      current.poolWins += 1;
    } else if (match.discipline === "Snooker") {
      current.snookerWins += 1;
    }

    current.lastWinAt = match.endedAt;
    scoreboard.set(match.winner, current);
  });

  return Array.from(scoreboard.values()).sort((left, right) => {
    if (right.wins !== left.wins) {
      return right.wins - left.wins;
    }

    return new Date(right.lastWinAt) - new Date(left.lastWinAt);
  });
}
