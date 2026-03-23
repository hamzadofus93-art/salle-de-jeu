import { prisma } from "../db/prisma.mjs";
import { toPublicMatch, toPublicTable } from "../utils/serializers.mjs";

export async function getDashboardState(limit = 8) {
  const [tables, leaderboard, history] = await Promise.all([
    prisma.gameTable.findMany({
      include: {
        matches: {
          where: { status: "ACTIVE" },
          orderBy: { startedAt: "desc" },
        },
        waitingEntries: {
          orderBy: { position: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    getLeaderboard(),
    getHistory(limit),
  ]);

  const publicTables = tables.map(toPublicTable);
  const freeCount = publicTables.filter((table) => table.status === "free").length;
  const activeCount = publicTables.filter((table) => table.status === "occupied").length;
  const archiveCount = history.total;
  const occupancyRate = publicTables.length
    ? Math.round((activeCount / publicTables.length) * 100)
    : 0;

  return {
    summary: {
      freeCount,
      activeCount,
      archiveCount,
      occupancyRate,
      topPlayer: leaderboard.rows[0] || null,
    },
    tables: publicTables,
    leaderboard: leaderboard.rows,
    history: history.rows,
    historyTotal: history.total,
  };
}

export async function getLeaderboard() {
  const finishedMatches = await prisma.match.findMany({
    where: {
      status: "FINISHED",
      winnerName: {
        not: null,
      },
    },
    orderBy: { endedAt: "desc" },
  });

  const scoreboard = new Map();

  finishedMatches.forEach((match) => {
    const key = match.winnerName;
    const current = scoreboard.get(key) || {
      name: match.winnerName,
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
    scoreboard.set(key, current);
  });

  return {
    rows: Array.from(scoreboard.values()).sort((left, right) => {
      if (right.wins !== left.wins) {
        return right.wins - left.wins;
      }

      return new Date(right.lastWinAt) - new Date(left.lastWinAt);
    }),
  };
}

export async function getHistory(limit = 8) {
  const nextLimit = Math.max(1, Number.parseInt(String(limit || "8"), 10) || 8);
  const [total, matches] = await Promise.all([
    prisma.match.count({
      where: { status: "FINISHED" },
    }),
    prisma.match.findMany({
      where: { status: "FINISHED" },
      include: { table: true },
      orderBy: { endedAt: "desc" },
      take: nextLimit,
    }),
  ]);

  return {
    total,
    rows: matches.map((match) => ({
      ...toPublicMatch(match),
      tableName: match.table?.name || null,
    })),
  };
}
