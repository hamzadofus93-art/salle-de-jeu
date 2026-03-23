export const STORAGE_KEY = "club-manager-state-v1";
export const PAGE_NAMES = [
  "home",
  "pool",
  "snooker",
  "lobby",
  "start",
  "finish",
  "leaderboard",
  "history",
  "accounts",
];

export const TABLE_DEFINITIONS = [
  ...Array.from({ length: 6 }, (_, index) => ({
    id: `pool-${index + 1}`,
    name: `Phoenix Pool ${index + 1}`,
    discipline: "Pool anglais",
    shortDiscipline: "Pool",
  })),
  ...Array.from({ length: 3 }, (_, index) => ({
    id: `snooker-${index + 1}`,
    name: `Phoenix Snooker ${index + 1}`,
    discipline: "Snooker",
    shortDiscipline: "Snooker",
  })),
];
