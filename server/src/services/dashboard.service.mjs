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
    getHistory({ pageSize: limit }),
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

export async function getHistory(options = {}) {
  const normalizedOptions =
    typeof options === "object" && options !== null
      ? options
      : { pageSize: options };

  const page = parsePositiveInteger(normalizedOptions.page, 1, { max: 9999 });
  const pageSize = parsePositiveInteger(normalizedOptions.pageSize, 8, { max: 50 });
  const discipline = normalizeHistoryDiscipline(normalizedOptions.discipline);
  const search = normalizeSearch(normalizedOptions.search);
  const where = {
    status: "FINISHED",
    ...(discipline ? { discipline } : {}),
    ...(search
      ? {
          OR: [
            { playerOne: { contains: search } },
            { playerTwo: { contains: search } },
            { winnerName: { contains: search } },
            { table: { name: { contains: search } } },
          ],
        }
      : {}),
  };
  const total = await prisma.match.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const matches = await prisma.match.findMany({
    where,
    include: { table: true },
    orderBy: { endedAt: "desc" },
    skip: (safePage - 1) * pageSize,
    take: pageSize,
  });

  return {
    total,
    page: safePage,
    pageSize,
    totalPages,
    rows: matches.map((match) => ({
      ...toPublicMatch(match),
      tableName: match.table?.name || null,
    })),
  };
}

function parsePositiveInteger(value, fallback, { max = 100 } = {}) {
  const parsedValue = Number.parseInt(String(value || fallback), 10);

  if (!Number.isFinite(parsedValue) || parsedValue < 1) {
    return fallback;
  }

  return Math.min(parsedValue, max);
}

function normalizeHistoryDiscipline(value) {
  if (value === "snooker") {
    return "Snooker";
  }

  if (value === "pool") {
    return "Pool anglais";
  }

  return null;
}

function normalizeSearch(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 50);
}
